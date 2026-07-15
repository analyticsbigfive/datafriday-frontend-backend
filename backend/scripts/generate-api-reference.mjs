#!/usr/bin/env node
/**
 * Génère docs/api/API_REFERENCE.md à partir des décorateurs Swagger des contrôleurs.
 *
 * Usage : node scripts/generate-api-reference.mjs
 *
 * Le catalogue des routes est extrait statiquement de src (@Controller, @Get/@Post/…,
 * @ApiOperation). Les notes par module et par route vivent dans les maps NOTES /
 * ROUTE_NOTES ci-dessous : c'est ici qu'on documente les query params et
 * comportements non déductibles des décorateurs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'api', 'API_REFERENCE.md');

// ---------------------------------------------------------------------------
// Extraction statique
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.controller.ts') && !e.name.includes('.spec.')) out.push(p);
  }
  return out;
}

function parseFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const ctrls = [...src.matchAll(/@Controller\s*\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g)];
  const out = [];
  for (let ci = 0; ci < ctrls.length; ci++) {
    const start = ctrls[ci].index;
    const end = ci + 1 < ctrls.length ? ctrls[ci + 1].index : src.length;
    const seg = src.slice(start, end);
    const prefix = ctrls[ci][1] ?? ctrls[ci][2] ?? '';
    const beforeCtrl = src.slice(Math.max(0, start - 400), start);
    const tagM = [...beforeCtrl.matchAll(/@ApiTags\s*\(\s*'([^']*)'/g)].pop();

    const methods = [...seg.matchAll(/@(Get|Post|Put|Patch|Delete)\s*\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)?\s*\)/g)]
      .map((m) => ({ pos: m.index, method: m[1].toUpperCase(), sub: m[2] ?? m[3] ?? m[4] ?? '', summary: '' }));
    const ops = [...seg.matchAll(/@ApiOperation\s*\(\s*\{\s*summary:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`]*)`)/g)]
      .map((m) => ({ pos: m.index, text: (m[1] ?? m[2] ?? m[3] ?? '').replace(/\\'/g, "'") }));
    for (const op of ops) {
      let best = null;
      let bestD = Infinity;
      for (const mt of methods) {
        const d = Math.abs(mt.pos - op.pos);
        if (d < bestD) { bestD = d; best = mt; }
      }
      if (best && bestD < 600 && !best.summary) best.summary = op.text;
    }
    out.push({
      file: path.relative(ROOT, file),
      tag: tagM ? tagM[1] : '(sans tag)',
      routes: methods.map((mt) => ({
        method: mt.method,
        path: ('/' + [prefix, mt.sub].filter(Boolean).join('/')).replace(/\/+/g, '/'),
        summary: mt.summary,
      })),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Organisation du document : sections → tags, notes par module et par route
// ---------------------------------------------------------------------------

const SECTIONS = [
  {
    title: 'Général',
    tags: ['App', 'Health'],
    intro: '`GET /health` est public ; `/health/protected` et `/health/admin` servent à tester la chaîne auth/RBAC. Les métriques (`/metrics*`) exposent cache, queues et DB.',
  },
  {
    title: 'Auth, comptes & RBAC',
    tags: ['Onboarding', 'Me', 'Users', 'Roles', 'Permissions', 'Organizations', 'Tenants'],
    intro: 'Auth Supabase (JWT Bearer). Onboarding = seul groupe accessible sans tenant. RBAC dynamique : ADMIN + 6 rôles métier, permissions par écran. Un compte déjà rattaché à une organisation ne peut pas en créer une nouvelle (409).',
  },
  {
    title: 'Espaces & Builder',
    tags: ['Spaces', 'Configurations', 'Builder v2', 'Pinned Spaces', 'Space Dashboard'],
    intro: 'Le Builder v2 (zones/éléments relationnels, table `Zone`) est le chemin principal ; `Configurations` (floors JSON v1) est legacy — pas de nouvelles écritures v1 quand l\'espace a des zones.',
  },
  {
    title: 'Menus d\'espace, inventaire & réarmement',
    tags: ['Space Menus', 'Inventory', 'Restock State', 'KV'],
    intro: 'La disponibilité des menu items est calculée côté serveur (ingrédient actif + fournisseur résolu + `Supplier.sites` contenant l\'espace, règle stricte). L\'inventaire des shops est dérivé du menu (déduplication par référence de recette), les quantités persistent dans `ElementInventory`.',
  },
  {
    title: 'Événements & prédiction',
    tags: ['Events', 'Event Types', 'Event Categories', 'Event Subcategories', 'Teams', 'Event Predict Versions'],
    intro: 'Les events portent tickets vendus/scannés et, pour le sport, les équipes (les events gardent le nom en repli si l\'équipe est supprimée). Les versions de prédiction sont rattachées à un event, avec une version par défaut exclusive.',
  },
  {
    title: 'Catalogue, recettes & coûts',
    tags: ['Menu Items', 'Product Types', 'Product Categories', 'Brands', 'Display Names', 'Menu Components', 'Ingredients', 'Packaging', 'Suppliers', 'Market Prices', 'Market Price Types', 'Market Price Categories'],
    intro: 'Prix de vente par espace sur les menu items : `spacePrices` `{ spaceId: { ttc, vatRate } }`, `basePrice` = repli global ; chaque application de prix est historisée (`MenuItemPriceHistory`, scopée espace). Les Market Prices ont leur propre taxonomie (types/catégories), distincte de celle des menu items.',
  },
  {
    title: 'Intégration Weezevent & analytics',
    tags: ['Integrations', 'Mappings', 'Aggregation', 'Weezevent', 'Weezevent Analytics', 'Weezevent Webhooks', 'Analyse', 'Orchestrator'],
    intro: 'Pipeline : credentials (Integrations, multi-instance) → sync (jobs par bissection) → mappings location/shop/merchant/produit → agrégation → analytics. Le prix F&B affiché est dérivé des transactions (prix modal par produit×espace) car le catalogue Weezevent est souvent sans prix.',
  },
];

// Notes de module affichées sous le titre du tag (complément de l'intro de section).
const NOTES = {
  'Builder v2': 'Verrou optimiste : `PATCH /elements/:id` exige le header `If-Match` (version élément). Suppressions : 409 avec `blockers`/`reasons`/`orphanCount`, puis `?force=true` après confirmation utilisateur. `performance`/`staff`/`inventory` sont scopés configuration via `?configId=` (défaut : première adhésion).',
  'Space Menus': '`GET /shop/:shopId/items` accepte `?enabledOnly=true`. `GET /storage-inventory?shopIds=a,b,c` agrège l\'inventaire dérivé de plusieurs shops (élément Storage du builder2 : recettes F&B + articles merch).',
  'Menu Items': '`GET /menu-items?spaceId=` filtre les items associés à un espace (évite de paginer tout le catalogue). `backfill-weezevent-prices` : body `{ dryRun, overwrite, eventId? }`, résout le dernier prix non nul **de l\'espace** (jamais cross-espace).',
  Mappings: '`GET /product-menu?includeSales=true` (défaut `false`) ajoute l\'agrégat `salesPricing`, coûteux — ne l\'activer que là où le prix comparé est affiché.',
  Spaces: '`GET /:id/shops?configId=` scope la liste à une configuration. `POST /:id/quick-elements/bulk` remplace la boucle quick-element + location-shop (1 appel au lieu de ~2N). `POST /:id/assign-floor` porte `zoneName`/`position`/`shopDimensions` et accepte `configId`.',
  Configurations: 'Legacy v1 (floors JSON). À n\'utiliser que pour les espaces sans zones v2 ; le save réécrit et renvoie les ids d\'éléments (réconciliation par `level` côté front).',
  Users: 'Expose `status`/`lastSignInAt` (Supabase) et le champ `phone`. `POST /:id/reinvite` répond 409 si l\'utilisateur s\'est déjà connecté ou appartient à plusieurs organisations.',
  Weezevent: '`POST /sync/start` lance un job de synchronisation par bissection ; suivi via `/sync/status/:jobId`, `/sync/jobs*`. `GET /integrity` liste mappings cassés et doublons du tenant.',
  Suppliers: '`Supplier.sites` = liste des espaces desservis ; un tableau vide signifie **aucun** espace (règle stricte utilisée par la disponibilité des menus).',
  Inventory: 'Snapshots append-only par espace(+event) ; `POST /inventory-counts` fait un upsert unitaire par space+event+shop+item.',
  Tenants: 'Réservé super admin (administration des organisations).',
  KV: '⚠️ **Module non enregistré dans AppModule** : ces routes existent dans le code mais renvoient 404 en réel (décision « KV front » en attente). Absentes de la spec OpenAPI.',
};

// Notes par route : clé `METHOD /path` (ajoutées en fin de description).
const ROUTE_NOTES = {
  'GET /menu-items': 'Query : `spaceId`, pagination.',
  'GET /spaces/:id/shops': 'Query : `configId`.',
  'GET /space-menu/shop/:shopId/items': 'Query : `enabledOnly`.',
  'GET /space-menu/storage-inventory': 'Query : `shopIds` (csv).',
  'GET /mappings/product-menu': 'Query : `includeSales` (défaut `false`).',
  'PATCH /builder-v2/elements/:id': 'Header `If-Match` requis.',
  'DELETE /builder-v2/zones/:id': 'Query : `force`.',
  'DELETE /builder-v2/elements/:id': 'Query : `force`.',
  'POST /webhooks/weezevent/:tenantId/:integrationId': 'Public (signé) — pas de JWT.',
};

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------

const controllers = walk(path.join(ROOT, 'src')).sort().flatMap(parseFile);
const byTag = new Map();
for (const c of controllers) {
  if (!byTag.has(c.tag)) byTag.set(c.tag, { files: [], routes: [] });
  const t = byTag.get(c.tag);
  if (!t.files.includes(c.file)) t.files.push(c.file);
  t.routes.push(...c.routes);
}

const covered = new Set(SECTIONS.flatMap((s) => s.tags));
const uncovered = [...byTag.keys()].filter((t) => !covered.has(t));
if (uncovered.length) {
  SECTIONS.push({ title: 'Non classé (à ranger dans le générateur)', tags: uncovered, intro: '' });
}

const totalRoutes = controllers.reduce((a, c) => a + c.routes.length, 0);
const esc = (s) => s.replace(/\|/g, '\\|');
const lines = [];

lines.push('# API Reference — DataFriday');
lines.push('');
lines.push('> ⚙️ **Document généré** par `node scripts/generate-api-reference.mjs` — ne pas éditer à la main.');
lines.push('> Les descriptions viennent des décorateurs `@ApiOperation` des contrôleurs ; les notes de module vivent dans le script.');
lines.push('');
lines.push(`**${totalRoutes} routes** · générées le ${new Date().toISOString().slice(0, 10)}`);
lines.push('');
lines.push('## Base URL');
lines.push('');
lines.push('```');
lines.push('Staging/Prod : https://datafriday-api.onrender.com');
lines.push('Local        : http://localhost:3000');
lines.push('```');
lines.push('');
lines.push('**Préfixe :** `/api/v1` (toutes les routes ci-dessous sont relatives à ce préfixe)');
lines.push('');
lines.push('- Documentation interactive : `/docs` (Basic Auth via `DOCS_USER`/`DOCS_PASSWORD` si définis)');
lines.push('- Spécification OpenAPI brute : `GET /api/v1/openapi.json` (public, consommé par le front et la CI)');
lines.push('- Export statique de la spec : [openapi.json](./openapi.json) (régénéré par `pnpm docs:api`) — importable dans Postman/Insomnia, générateurs de clients, etc.');
lines.push('');
lines.push('## Authentification');
lines.push('');
lines.push('JWT Supabase dans `Authorization: Bearer <token>`. Exceptions : `GET /health`, le webhook Weezevent et `openapi.json`.');
lines.push('Le groupe **Onboarding** exige le JWT mais pas de tenant ; tout le reste exige un utilisateur rattaché à un tenant (isolation multi-tenant automatique côté Prisma).');
lines.push('CORS : headers autorisés `Content-Type`, `Authorization`, `X-Requested-With`, `If-Match`.');
lines.push('');
lines.push('Codes d\'erreur : voir [HTTP_ERROR_CODES.md](./HTTP_ERROR_CODES.md). Guides détaillés : [SPACES_API_GUIDE.md](./SPACES_API_GUIDE.md), [FRONTEND_API_GUIDE.md](./FRONTEND_API_GUIDE.md), [FRONTEND_MENU_COMPOSITION_API.md](./FRONTEND_MENU_COMPOSITION_API.md).');
lines.push('');
lines.push('## Sommaire');
lines.push('');
for (const s of SECTIONS) {
  const n = s.tags.reduce((a, t) => a + (byTag.get(t)?.routes.length ?? 0), 0);
  lines.push(`- [${s.title}](#${s.title.toLowerCase().replace(/[^a-z0-9àâäéèêëîïôöùûüç' -]/g, '').replace(/['\s]+/g, '-')}) — ${n} routes`);
}
lines.push('');

for (const s of SECTIONS) {
  lines.push('---');
  lines.push('');
  lines.push(`## ${s.title}`);
  lines.push('');
  if (s.intro) { lines.push(s.intro); lines.push(''); }
  for (const tag of s.tags) {
    const t = byTag.get(tag);
    if (!t) continue;
    lines.push(`### ${tag}`);
    lines.push('');
    lines.push(`_Source : ${t.files.map((f) => `\`${f}\``).join(', ')}_`);
    lines.push('');
    if (NOTES[tag]) { lines.push(NOTES[tag]); lines.push(''); }
    lines.push('| Méthode | Route | Description |');
    lines.push('|---|---|---|');
    for (const r of t.routes) {
      const note = ROUTE_NOTES[`${r.method} ${r.path}`];
      const desc = [r.summary, note].filter(Boolean).join(' — ');
      lines.push(`| ${r.method} | \`${esc(r.path)}\` | ${esc(desc || '—')} |`);
    }
    lines.push('');
  }
}

lines.push('---');
lines.push('');
lines.push('_Régénérer après tout ajout/modification de route : `node scripts/generate-api-reference.mjs`_');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'));
console.log(`OK — ${totalRoutes} routes, ${byTag.size} modules → ${path.relative(ROOT, OUT)}`);
if (uncovered.length) console.warn('⚠️ Tags non classés :', uncovered.join(', '));
