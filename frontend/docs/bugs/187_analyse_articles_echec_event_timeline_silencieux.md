# BUG-187 — Analyse : échec du batch `event-timeline` avalé → « Aucun article disponible » trompeur

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟠 Majeur (masque un incident backend derrière un message métier faux)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web` (+ miroir cause backend :
  `api-datafriday-staging/docs/bugs/103_event_timeline_articles_vides_jointure_mapping.md`)
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/composables/useAnalyseItemRecords.js` (catch), `src/components/analyse/AnalyseView.vue`,
  `src/i18n/translations.js`

## Symptôme

Quand `GET /spaces/:id/event-timeline?eventIds=…` échoue (500, réseau, timeout), l'écran Analyse
affiche exactement le même état qu'une absence légitime de données : donuts « 0 articles /
0 types / 0 catégories », « Aucun article disponible pour cette configuration », PdV à
« Moy. 0 / Total 0 / Événements 0 » — alors que le CA total (shop-level, autre endpoint)
s'affiche. Seul indice : un `console.warn` invisible pour l'utilisateur.

## Cause racine

`useAnalyseItemRecords.js` : le `catch` du batch loggait un warn puis cachait `[]` pour chaque
event demandé (anti-boucle de refetch légitime), sans exposer l'erreur. En aval, la chaîne
`soldItemOptions` → `salesMenuItemNames` → `filtersState = 'empty-no-items'`
(`store/modules/analyse.js`) → message i18n `anCatalogNoItems` interprète ce vide comme un fait
métier. Deux instances du composable (courante + comparaison) doublaient le risque de spam si on
alertait naïvement.

## Correction

2026-07-18 :

- `useAnalyseItemRecords.js` : flag module `_warnedBatchKo` (une alerte par session, toutes
  instances confondues — même pattern que `_warnedPredictionDegraded` de la fiche 19) + ref
  `fetchError` exposée dans le retour du composable. Le cache `[]` est conservé (anti-boucle).
- `AnalyseView.vue` : `watch` sur les `fetchError` des deux instances → snackbar `warning`
  existante (refs de `useAnalyseCapture`), nouvelle clé i18n `anItemTimelineLoadError` (en/fr).

## Cause transport confirmée (2026-07-18, diagnostic MCP Supabase + probes)

Le cas réel signalé (espace Auxerre) n'était **ni** la jointure backend (fiche 103 : le SQL déployé
renvoie 22 541 lignes / 11 events, DB saine) **ni** un vide légitime : le backend Render (free
tier) s'endort après ~15 min et met **~53 s à se réveiller** (mesuré) — sous le timeout axios de
60 s quand une seule requête part, au-dessus quand les requêtes lourdes de `fetchSpaceData`
partent en parallèle à froid : `getAllMenuItems`, `getProductMappings`, `getMarketPrices` et le
batch `event-timeline` expirent ensemble (`ECONNABORTED`), tous avalés en `[]`/`{}`.

Mitigation front (2026-07-18, `src/api/client.js`) :

- **Warm-up** : ping fire-and-forget de `GET /health` (public, 200 sans auth) au chargement du
  module client — le réveil Render démarre pendant le login/la navigation.
- **Retry conditionnel** : sur `ECONNABORTED` d'un GET non déjà retenté, sonde `/health` (5 s
  max) ; si elle répond, le timeout venait du réveil → un seul retry (serveur désormais chaud).
  Sinon, endpoint réellement lent → pas de retry (décision d'origine conservée, cf. commentaire
  historique du client).

Le vrai fix reste côté infra : keep-alive externe ou upgrade du plan Render (fiche back 103).

## Risque de régression / à surveiller

- La snackbar partage les refs de capture/partage — un échec timeline simultané à un « copié ! »
  écrase le texte (dernier gagnant, acceptable).
- Pas de bouton retry : recharger la page (le cache par event est en mémoire de module).
- Aucun test unitaire ajouté (composable non couvert, snackbar difficile à tester sans harness).

## Références

- Cause backend et SQL de diagnostic : fiche backend 91.
- Pattern « une alerte par session » : fiche 19 (`SpaceRestockView.vue`).
