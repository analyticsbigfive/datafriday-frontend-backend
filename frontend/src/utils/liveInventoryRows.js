// Onglet Inventaire live (docs/modules/11_LIVE.md §3/§15) — transformation pure
// de la réponse GET /spaces/:id/live/inventory en arbre affichable : jauge par
// article, statut de criticité, tri et filtre. Extrait de LiveInventoryPanel.vue
// pour garder le composant focalisé sur le rendu (pas de logique métier foldée
// dans le host).

// Seuils de la jauge "restant / départ", palette status figée (jamais thémée),
// cf. skill dataviz : good ≥50%, warning 20-50%, critical <20%. Mode-invariant
// (validée à la fois sur surface claire et sombre).
export const GAUGE_WARNING_THRESHOLD = 50;
export const GAUGE_CRITICAL_THRESHOLD = 20;

// Ordre de tri par criticité — les vrais problèmes (critical/warning) remontent
// en premier ; "uninitialized" (rien à signaler, juste pas encore compté) reste
// après, "good" en dernier. Même logique côté badge (countByStatus ci-dessous).
const STATUS_RANK = { critical: 0, warning: 1, uninitialized: 2, good: 3 };

/**
 * Un article un jamais eu de stock fixé (aucun Reset/mouvement Logistique
 * n'a encore posé de StockLevel > 0) : distinct d'une vraie rupture (stock
 * fixé mais épuisé par les ventes). Règle maison du projet (cf.
 * getPreEventInventory/getPostEventBaseline) : jamais de 0 fabriqué qui se lit
 * comme un vrai signal — "uninitialized" est neutre (gris, "—"), pas rouge.
 */
function computeGaugeStatus(gaugePercent, totalLoose) {
  if (totalLoose === 0) return 'uninitialized';
  if (gaugePercent < GAUGE_CRITICAL_THRESHOLD) return 'critical';
  if (gaugePercent < GAUGE_WARNING_THRESHOLD) return 'warning';
  return 'good';
}

// Restant affiché = (packs × unitsPerPack + loose) − consumedLoose, repack ici
// (casse de pack). Composants bruts fournis par l'endpoint (LIVE_API_GUIDE §3.3).
export function buildLiveInventoryChild(node, label, keySeed) {
  const unit = node.unit || '';
  const unitsPerPack = Number(node.unitsPerPack) || 0;
  const packed = Number(node.packedUnits) || 0;
  const loose = Number(node.looseUnits) || 0;
  const consumed = Number(node.consumedLoose) || 0;
  const perPack = unitsPerPack > 0 ? unitsPerPack : 1;
  const totalLoose = packed * perPack + loose;
  const remainingLoose = Math.max(0, totalLoose - consumed);

  const gaugePercent = totalLoose > 0
    ? Math.round(Math.min(100, Math.max(0, (remainingLoose / totalLoose) * 100)))
    : 0;
  const gaugeStatus = computeGaugeStatus(gaugePercent, totalLoose);
  // "—" plutôt qu'un "0%" fabriqué quand rien n'a jamais été compté (cf. doc ci-dessus).
  const gaugeLabel = gaugeStatus === 'uninitialized' ? '—' : `${gaugePercent}%`;
  // Sous le seuil critique, le remplissage est trop étroit pour loger le texte
  // en lisible, le label bascule à l'extérieur de la piste (cf. template).
  const gaugeLabelInside = gaugeStatus !== 'uninitialized' && gaugePercent >= GAUGE_CRITICAL_THRESHOLD;

  return {
    key: keySeed, label, unit, remainingLoose, consumedLoose: consumed,
    totalLoose, gaugePercent, gaugeStatus, gaugeLabel, gaugeLabelInside,
  };
}

/**
 * Nombre d'articles d'un statut donné ('critical' = en rupture, <20% ;
 * 'warning' = stock bas, 20-50%) dans un groupe. Les deux sont volontairement
 * DISTINCTS — un article à 0% (rupture réelle) n'est pas "juste" un stock bas,
 * les confondre sous un seul filtre/badge a induit l'utilisateur en erreur
 * (retour 2026-08-05 : "pourquoi je vois aussi des ruptures dans stock bas").
 */
export function countByStatus(children, status) {
  return children.reduce((n, c) => n + (c.gaugeStatus === status ? 1 : 0), 0);
}
/** @deprecated alias de countByStatus(children, 'critical'), conservé pour compat. */
export function countCritical(children) {
  return countByStatus(children, 'critical');
}

function matchesSearch(label, search) {
  if (!search) return true;
  return label.toLowerCase().includes(search.toLowerCase());
}

/**
 * Arbre Shop→items ou Item→shops à partir de la réponse brute, avec enfants
 * triés par criticité, filtrés par recherche texte (nom d'article ou de shop
 * selon la vue) et, via `statusFilters` (sous-ensemble de ['warning',
 * 'critical']), réduits aux seuls statuts cochés — gestion des stocks en
 * urgence : voir tout ce qui a besoin d'attention sans dépendre de connaître
 * le nom exact d'un article (la recherche texte seule ne répond pas à ce
 * besoin). "Stock bas" (warning) et "Rupture" (critical) sont deux filtres
 * INDÉPENDANTS et combinables, jamais fusionnés sous un même bouton. Un
 * groupe dont tous les enfants sont filtrés disparaît dès qu'un filtre est actif.
 */
export function buildLiveInventoryRows(inv, view, search = '', statusFilters = []) {
  if (!inv) return [];
  const term = (search || '').trim();
  const hasStatusFilter = Array.isArray(statusFilters) && statusFilters.length > 0;
  const filterActive = !!term || hasStatusFilter;

  const sortAndFilter = (children) => {
    let filtered = term ? children.filter((c) => matchesSearch(c.label, term)) : children;
    if (hasStatusFilter) filtered = filtered.filter((c) => statusFilters.includes(c.gaugeStatus));
    return [...filtered].sort((a, b) => STATUS_RANK[a.gaugeStatus] - STATUS_RANK[b.gaugeStatus]);
  };

  let groups;
  if (view === 'shop') {
    groups = (inv.shops || []).map((s) => ({
      key: `shop:${s.shopId}`,
      label: s.shopName || s.shopId || '—',
      children: sortAndFilter((s.items || []).map((it) => buildLiveInventoryChild(it, it.itemKey || '—', `${s.shopId}:${it.itemKey}`))),
    }));
  } else {
    groups = (inv.items || []).map((it) => ({
      key: `item:${it.itemKey}`,
      label: it.itemKey || '—',
      children: sortAndFilter((it.shops || []).map((s) => buildLiveInventoryChild(s, s.shopName || s.shopId || '—', `${it.itemKey}:${s.shopId}`))),
    }));
  }

  // Un filtre actif (recherche et/ou statut) masque les groupes vidés —
  // sans filtre, tous les groupes restent visibles même à 0 enfant.
  return filterActive ? groups.filter((g) => g.children.length) : groups;
}

/**
 * Total d'articles d'un statut donné sur TOUT l'espace, indépendamment de la
 * vue affichée (par shop / par item décrivent les mêmes paires shop×article) —
 * calculé sur les shops bruts pour compter chaque paire une seule fois. Sert
 * aux badges globaux de la toolbar (visibles sans rien déplier ni filtrer).
 */
export function countGlobalByStatus(inv, status) {
  if (!inv) return 0;
  return (inv.shops || []).reduce(
    (n, s) => n + (s.items || []).filter((it) => buildLiveInventoryChild(it, '', '').gaugeStatus === status).length,
    0,
  );
}
