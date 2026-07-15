// =============================================================================
//  Matcher sémantique d'intents — Transformers.js
// =============================================================================
//  Principe : on encode la question utilisateur ET la phrase canonique de
//  chaque intent en vecteurs (embeddings), puis on prend l'intent dont la
//  similarité cosinus est la plus haute.
//
//  Avantages :
//  • Comprend les paraphrases ("quel stand cartonne ?" → top_shops)
//  • Pas de regex à maintenir pour chaque variation
//  • 100 % local, gratuit, exécution navigateur (WASM/WebGPU)
//
//  Modèle : Xenova/multilingual-e5-small (~120 Mo quantifié, supporte le FR)
//  Alternative plus légère anglais : Xenova/all-MiniLM-L6-v2 (~25 Mo)
// =============================================================================

let _pipeline = null
let _loading = null

// Phrases canoniques associées à chaque intent (alignées sur src/utils/analyseAssistant.js).
// Plusieurs phrases par intent → on garde le score max.
export const INTENT_PHRASES = {
  greet: ['bonjour', 'salut', 'coucou', 'hello', 'hey'],
  help: ['aide', 'que peux-tu faire', 'comment ça marche', 'quelles questions je peux poser', 'à quoi tu sers', "liste des commandes"],
  topMenuItems: [
    'top des articles',
    'meilleurs produits vendus',
    'articles phares',
    'quels articles se vendent le mieux',
    'meilleures ventes sur les concerts',
    'produits stars en sport',
    'quel produit se vend le plus',
    'article le plus vendu',
    'top 5 des produits',
    'meilleures références',
    'quels sont mes best-sellers',
    'produits les plus populaires',
  ],
  topShops: [
    'top des points de vente',
    'meilleurs stands',
    'quel stand cartonne le mieux',
    'shops les plus rentables',
    'meilleur stand sur les matchs',
    'point de vente performant en concert',
    'quel est mon meilleur point de vente',
    'quel kiosque vend le plus',
    'classement des points de vente',
    'quel bar rapporte le plus',
    'meilleur emplacement',
  ],
  kpiSummary: [
    'chiffre d\'affaires total',
    'CA global',
    'synthèse des KPI',
    'résumé des performances',
    'CA des concerts',
    'chiffre d\'affaires sport',
    'performance des matchs',
    'c\'est quoi mon chiffre d\'affaires',
    'combien j\'ai vendu',
    'quel est mon CA',
    'mes ventes totales',
    'revenu total',
    'vue d\'ensemble des ventes',
  ],
  costSummary: [
    'coût total',
    'combien j\'ai dépensé',
    'total des dépenses',
    'coûts des concerts',
    'dépenses sur les matchs',
    'quel est mon coût de revient',
    'montant des achats',
    'combien ça m\'a coûté',
  ],
  margin: [
    'marge moyenne',
    'rentabilité',
    'profit',
    'marge sur les concerts',
    'rentabilité du sport',
    'quelle est ma marge',
    'combien je gagne',
    'quel est mon bénéfice',
    'taux de marge',
  ],
  perCapita: ['panier par tête', 'moyenne par spectateur', 'per capita', 'dépense par visiteur sur un concert', 'dépense moyenne par personne', 'combien dépense chaque spectateur'],
  avgTransaction: ['panier moyen', 'transaction moyenne', 'ticket moyen', 'panier moyen sur les matchs', 'montant moyen par vente', 'valeur moyenne d\'une commande'],
  transactions: [
    'combien de transactions',
    'nombre de tickets',
    'transactions sur les concerts',
    'tickets vendus en sport',
    'nombre de ventes',
    'combien de commandes',
    'volume de transactions',
  ],
  eventsCount: [
    'combien d\'événements',
    'nombre d\'événements',
    'combien de concerts',
    'nombre de matchs',
    'combien d\'événements analysés',
    'nombre d\'événements sur la période',
  ],
  bestEvent: [
    'meilleur événement',
    'événement le plus rentable',
    'plus gros événement',
    'mon plus gros concert',
    'meilleur match',
    'concert le plus rentable',
    'événement le plus performant',
    'top concerts',
    'classement des matchs',
    'quel événement a le plus rapporté',
    'quel match a le mieux marché',
    'événement qui a généré le plus de CA',
    'quel concert a rapporté le plus',
    'quel match a rapporté le plus',
    'concert qui a fait le plus de chiffre',
  ],
  compareYoY: [
    'comparaison année dernière',
    'évolution N-1',
    'vs année précédente',
    'year over year',
    'comparaison avec l\'an dernier',
    'progression par rapport à l\'année passée',
  ],
  comparePrev: [
    'comparaison période précédente',
    'évolution sur le mois dernier',
    'vs période précédente',
    'comparaison avec la période d\'avant',
    'évolution récente',
  ],
  activeFilters: ['mes filtres actifs', 'quels filtres sont appliqués', 'quels sont mes filtres', 'filtres en cours'],
  resetFilters: ['efface les filtres', 'réinitialise les filtres', 'tout effacer', 'remets à zéro les filtres', 'enlève tous les filtres'],
}

// Seuil calibré EMPIRIQUEMENT sur multilingual-e5-small (préfixes query:/passage:).
// Ce modèle a une baseline de similarité TRÈS haute : mesures réelles →
// paraphrases in-scope ≈ 0.88-0.89, questions hors-scope ("météo demain",
// "raconte une blague") ≈ 0.84-0.85. À 0.55 TOUT passait → routage systématique
// vers l'intention la + proche même hors-scope = réponses « à côté ». 0.86 sépare
// in-scope (accepté) du hors-scope (→ fallback d'aide). 0.88 : la bande de
// recouvrement e5-small est étroite (~0.85-0.89) ; 0.88 rejette les questions
// hors-scope qui frôlaient (« pourquoi mes ventes baissent » ≈ 0.87) tout en
// gardant les vraies (≥ 0.882 mesuré). Marge serrée assumée : mieux vaut un
// « je ne traite pas ça » qu'un routage à côté (plainte utilisateur).
const SIM_THRESHOLD = 0.88

function cosineSim(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

// Charge le modèle une seule fois (idempotent).
export async function loadSemanticMatcher(onProgress) {
  if (_pipeline) return _pipeline
  if (_loading) return _loading

  _loading = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    // On utilise le CDN HuggingFace pour les fichiers du modèle.
    env.allowLocalModels = false
    env.useBrowserCache = true

    _pipeline = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
      quantized: true,
      progress_callback: onProgress,
    })
    return _pipeline
  })()

  return _loading
}

async function embed(text) {
  const pipe = await loadSemanticMatcher()
  // Pour les modèles E5, préfixer la requête par "query: " améliore la qualité.
  const out = await pipe(`query: ${text}`, { pooling: 'mean', normalize: true })
  return out.data
}

// Pré-calcul des embeddings des phrases canoniques (au premier call).
let _intentEmbeddings = null
async function getIntentEmbeddings() {
  if (_intentEmbeddings) return _intentEmbeddings
  const pipe = await loadSemanticMatcher()
  const entries = []
  for (const [tool, phrases] of Object.entries(INTENT_PHRASES)) {
    for (const p of phrases) {
      const out = await pipe(`passage: ${p}`, { pooling: 'mean', normalize: true })
      entries.push({ tool, phrase: p, vec: out.data })
    }
  }
  _intentEmbeddings = entries
  return entries
}

/**
 * Trouve l'intent le plus proche sémantiquement.
 * @returns {Promise<{ tool: string, score: number, phrase: string } | null>}
 */
export async function findIntentSemantic(query) {
  if (!query || !query.trim()) return null
  const [qVec, intents] = await Promise.all([embed(query), getIntentEmbeddings()])
  let best = { tool: null, score: -1, phrase: '' }
  for (const it of intents) {
    const s = cosineSim(qVec, it.vec)
    if (s > best.score) best = { tool: it.tool, score: s, phrase: it.phrase }
  }
  return best.score >= SIM_THRESHOLD ? best : null
}

export function isSemanticReady() {
  return !!_pipeline && !!_intentEmbeddings
}
