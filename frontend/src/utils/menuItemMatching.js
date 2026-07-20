// Matcher « produit/libellé vendu → menu item ».
// Source unique extraite de
// components/integration/wizard/StepMapMenuItems.vue (findBestMatch/similarity/
// isPriceCompatible). Réutilisé par la réconciliation EventPredict et la popup de
// remapping pour que le matching soit COHÉRENT avec le wizard /data-integration/fb.
//
// Algo : nom normalisé + tokens (préfixe flou) + similarité Levenshtein, pondéré
// 40% nom / 60% prix quand le prix est connu (sinon nom seul, plafonné à 80%).

/** Similarité Levenshtein normalisée (0..1). */
export function similarity(a, b) {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  const costs = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer[i - 1] !== shorter[j - 1])
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  return (longer.length - costs[shorter.length]) / longer.length;
}

/** Prix « compatibles » = écart < 1 centime (ou prix inconnu d'un côté). */
export function isPriceCompatible(productPrice, menuItemPrice) {
  if (productPrice == null || menuItemPrice == null) return true;
  return Math.abs(Number(productPrice) - Number(menuItemPrice)) < 0.01;
}

/**
 * Meilleur menu item correspondant à `productOrName` (string ou objet
 * `{ name, basePrice }`) dans `menuItemsList` (objets `{ id, name, basePrice }`).
 * Renvoie `{ ...mi, matchScore (0..100), priceVerified }` ou `null`.
 * Seuil de retour : score combiné > 0.5. Seuil « suggérable » conseillé : 70.
 */
export function findBestMatch(productOrName, menuItemsList) {
  const productName =
    typeof productOrName === 'string' ? productOrName : productOrName?.name;
  const productPrice =
    typeof productOrName === 'string' ? null : productOrName?.basePrice ?? null;
  if (!productName || !Array.isArray(menuItemsList) || !menuItemsList.length) return null;

  const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const tokenize = (s) => normalize(s).split(/\s+/).filter((w) => w.length >= 2);
  const normName = normalize(productName);
  const nameTokens = tokenize(productName);
  const priceKnown = productPrice != null;

  let best = null;
  let bestScore = 0;
  for (const mi of menuItemsList) {
    if (!mi) continue;
    // Filtre dur : prix connu → on rejette tout item au prix différent.
    if (priceKnown && !isPriceCompatible(productPrice, mi.basePrice)) continue;

    const normMi = normalize(mi.name);
    let nameScore;
    if (normName === normMi) {
      nameScore = 1.0;
    } else {
      const miTokens = tokenize(mi.name);
      let tokenScore = 0;
      if (nameTokens.length > 0 && miTokens.length > 0) {
        const common = nameTokens.filter((t) =>
          miTokens.some(
            (e) =>
              e === t ||
              (e.length >= 3 && t.length >= 3 && (e.startsWith(t) || t.startsWith(e))),
          ),
        );
        tokenScore = (common.length * 2) / (nameTokens.length + miTokens.length);
      }
      nameScore = Math.max(tokenScore, similarity(normName, normMi));
      // Seuil de nom plus strict quand le prix est inconnu (évite les variantes).
      if (nameScore <= (priceKnown ? 0.5 : 0.7)) continue;
    }

    let combined;
    if (priceKnown && mi.basePrice != null) {
      const priceExact = Math.abs(Number(productPrice) - Number(mi.basePrice)) < 0.01;
      const priceScore = priceExact ? 1.0 : 0.85;
      combined = nameScore * 0.4 + priceScore * 0.6;
    } else {
      // Prix du menu item inconnu (mi.basePrice == null) : ne pas gonfler le score
      // composite avec un priceScore par défaut proche du max — nom seul.
      combined = nameScore;
    }

    if (combined > bestScore) {
      bestScore = combined;
      const displayScore = priceKnown ? combined : Math.min(combined, 0.8);
      best = { ...mi, matchScore: Math.round(displayScore * 100), priceVerified: priceKnown };
    }
  }
  return best && bestScore > 0.5 ? best : null;
}

/**
 * Top-N menu items correspondant à `productOrName`. Seuil plus bas (0.3) pour capturer
 * davantage de candidats. Renvoie un tableau trié par score décroissant (max `n` éléments).
 */
export function findTopMatches(productOrName, menuItemsList, n = 5) {
  const productName =
    typeof productOrName === 'string' ? productOrName : productOrName?.name;
  const productPrice =
    typeof productOrName === 'string' ? null : productOrName?.basePrice ?? null;
  if (!productName || !Array.isArray(menuItemsList) || !menuItemsList.length) return [];

  const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const tokenize = (s) => normalize(s).split(/\s+/).filter((w) => w.length >= 2);
  const normName = normalize(productName);
  const nameTokens = tokenize(productName);
  const priceKnown = productPrice != null;

  const candidates = [];
  for (const mi of menuItemsList) {
    if (!mi) continue;
    if (priceKnown && !isPriceCompatible(productPrice, mi.basePrice)) continue;

    const normMi = normalize(mi.name);
    let nameScore;
    if (normName === normMi) {
      nameScore = 1.0;
    } else {
      const miTokens = tokenize(mi.name);
      let tokenScore = 0;
      if (nameTokens.length > 0 && miTokens.length > 0) {
        const common = nameTokens.filter((t) =>
          miTokens.some(
            (e) =>
              e === t ||
              (e.length >= 3 && t.length >= 3 && (e.startsWith(t) || t.startsWith(e))),
          ),
        );
        tokenScore = (common.length * 2) / (nameTokens.length + miTokens.length);
      }
      nameScore = Math.max(tokenScore, similarity(normName, normMi));
      if (nameScore <= 0.3) continue;
    }

    let combined;
    if (priceKnown) {
      const priceExact =
        mi.basePrice != null && Math.abs(Number(productPrice) - Number(mi.basePrice)) < 0.01;
      const priceScore = priceExact ? 1.0 : 0.85;
      combined = nameScore * 0.4 + priceScore * 0.6;
    } else {
      combined = nameScore;
    }

    const displayScore = priceKnown ? combined : Math.min(combined, 0.8);
    candidates.push({ ...mi, matchScore: Math.round(displayScore * 100), priceVerified: priceKnown });
  }

  candidates.sort((a, b) => b.matchScore - a.matchScore);
  return candidates.slice(0, n);
}
