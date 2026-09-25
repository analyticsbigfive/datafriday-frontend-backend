/**
 * Recopie le menu Space Menu (MenuAssignment scopées par configuration) d'une configuration
 * source vers une ou plusieurs configurations cibles du MÊME espace.
 *
 * Origine : jusqu'au correctif de BuilderV2Service.createConfiguration (2026-09-25), cloner une
 * configuration recopiait ses PdV (adhésions) mais pas leurs menus. Aix Arena : 10 configs créées
 * les 23 et 24/09 sans aucun article, Event Predict « No items available » (ABBA, 01/10).
 *
 * Règles :
 *  - seuls les PdV présents dans la cible ET la source sont servis (même élément, builder v2) ;
 *    un PdV de la cible absent de la source est listé, jamais deviné ;
 *  - une assignation déjà présente dans la cible (même PdV, même article) n'est jamais modifiée :
 *    le script complète, il n'écrase pas ce que quelqu'un aurait déjà coché ou décoché ;
 *  - coché/décoché recopié à l'identique.
 * Idempotent, DRY-RUN par défaut.
 *
 *   npx tsx scripts/copy-config-menus.ts --from <configId> --to <configId>[,<configId>]           # aperçu
 *   npx tsx scripts/copy-config-menus.ts --from <configId> --to <configId>[,<configId>] --apply   # applique
 *
 * Caches Redis : si REDIS_URL est défini, `spaces:shops:{tenant}:{space}*` et
 * `menu-items:{tenant}:*` sont purgés en mode --apply (mêmes motifs que
 * SpaceMenusService.invalidateAfterAssignmentWrite) ; sinon le script les liste.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const APPLY = process.argv.includes('--apply');
const argValue = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const FROM = (argValue('--from') || '').trim();
const TO = (argValue('--to') || '').split(',').map((s) => s.trim()).filter(Boolean);
// Clés RedisService : préfixe `datafriday:` (redis.service.ts, keyPrefix).
const REDIS_KEY_PREFIX = 'datafriday:';

async function loadConfig(id: string) {
  const config = await prisma.config.findUnique({
    where: { id },
    select: { id: true, name: true, spaceId: true, space: { select: { name: true, tenantId: true } } },
  });
  if (!config) throw new Error(`Configuration introuvable : ${id}`);
  return config;
}

async function memberElements(configId: string) {
  const rows = await prisma.configurationElement.findMany({
    where: { configId },
    select: { element: { select: { id: true, name: true, type: true } } },
  });
  return rows.map((r) => r.element);
}

async function purgeCaches(tenantId: string, spaceId: string) {
  const patterns = [`spaces:shops:${tenantId}:${spaceId}*`, `menu-items:${tenantId}:*`];
  if (!process.env.REDIS_URL) {
    console.log(`\nREDIS_URL absent : purger à la main les motifs ${patterns.map((p) => REDIS_KEY_PREFIX + p).join(', ')}`);
    return;
  }
  const redis = new Redis(process.env.REDIS_URL);
  try {
    for (const p of patterns) {
      const keys = await redis.keys(REDIS_KEY_PREFIX + p);
      if (keys.length) await redis.del(...keys);
      console.log(`Cache purgé : ${REDIS_KEY_PREFIX}${p} (${keys.length} clé(s))`);
    }
  } finally {
    redis.disconnect();
  }
}

async function main() {
  if (!FROM || !TO.length) {
    console.error('Usage : --from <configId> --to <configId>[,<configId>] [--apply]');
    process.exit(1);
  }
  const source = await loadConfig(FROM);
  const sourceAssignments = await prisma.menuAssignment.findMany({
    where: { configId: FROM, elementId: { not: null } },
    select: { elementId: true, menuItemId: true, enabled: true },
  });
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — source « ${source.name} » (${source.space.name}) : ${sourceAssignments.length} assignation(s)`);

  for (const targetId of TO) {
    const target = await loadConfig(targetId);
    if (target.spaceId !== source.spaceId) {
      console.log(`\n✗ « ${target.name} » : autre espace que la source, ignorée`);
      continue;
    }
    const targetElements = await memberElements(targetId);
    const sourceElementIds = new Set((await memberElements(FROM)).map((e) => e.id));
    const existing = await prisma.menuAssignment.findMany({
      where: { configId: targetId, elementId: { not: null } },
      select: { elementId: true, menuItemId: true },
    });
    const existingKeys = new Set(existing.map((a) => `${a.elementId}|${a.menuItemId}`));
    const targetIds = new Set(targetElements.map((e) => e.id));

    const toCreate = sourceAssignments.filter(
      (a) => targetIds.has(a.elementId as string) && !existingKeys.has(`${a.elementId}|${a.menuItemId}`),
    );
    const notInSource = targetElements.filter((e) => e.type !== 'storage' && !sourceElementIds.has(e.id));

    console.log(`\n→ « ${target.name} » : ${toCreate.length} assignation(s) à créer, ${existing.length} déjà présente(s)`);
    const byElement = new Map<string, number>();
    for (const a of toCreate) byElement.set(a.elementId as string, (byElement.get(a.elementId as string) || 0) + 1);
    for (const e of targetElements) {
      if (byElement.has(e.id)) console.log(`   ${e.name} : +${byElement.get(e.id)}`);
    }
    if (notInSource.length) {
      console.log(`   PdV absents de la source (non servis) : ${notInSource.map((e) => e.name).join(', ')}`);
    }

    if (APPLY && toCreate.length) {
      const res = await prisma.menuAssignment.createMany({
        data: toCreate.map((a) => ({
          configId: targetId,
          elementId: a.elementId,
          menuItemId: a.menuItemId,
          enabled: a.enabled,
        })),
        skipDuplicates: true,
      });
      console.log(`   ✓ ${res.count} assignation(s) créée(s)`);
    }
  }

  if (APPLY) await purgeCaches(source.space.tenantId, source.spaceId);
  else console.log('\nAperçu seulement : relancer avec --apply pour écrire.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
