# BUG-172 — Chaîne `/analyse/*` entièrement morte : action jamais dispatchée, buckets jamais lus

- **Statut** : 🟢 Corrigé (code mort supprimé, 2026-07-18)
- **Sévérité** : 🟡 Mineur (code mort ; masquait le vrai statut des endpoints backend)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : les deux (backend : voir `api-datafriday-staging/docs/bugs/89_analyse_swagger_faux_spaceid_ignore.md`)
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/store/modules/analyse.js` (ex-`loadSpaceLightweight`, ex-state `spaceSummary`/`menuKpis`/`eventKpis`/`costBreakdown`), ex-`src/api/endpoints/analyse.api.js`, ex-`src/data/analyseApiMock.js`

## Symptôme

Grep exhaustif : `loadSpaceLightweight` (seul appelant des 4 wrappers `/analyse/*`) n'était **dispatché nulle part**, et les 4 buckets d'état qu'il alimentait n'étaient **lus par aucun composant**. Le vrai chemin de chargement de la vue est `loadSpace → useSpaceDataFetch` (two-phase `useSpaceData`). Conséquences invisibles jusqu'ici : le mismatch de contrat et le `?spaceId=` ignoré côté backend (fiche back 89) n'avaient aucun témoin ; l'action avalait aussi les erreurs phase-1 en `console.warn`.

## Cause racine

Reliquat du plan « first-paint lightweight » abandonné au profit du two-phase `useSpaceData`.

## Correction

2026-07-18 — supprimés : action `loadSpaceLightweight`, 4 champs d'état + 4 mutations (`SET_SPACE_SUMMARY`/`SET_MENU_KPIS`/`SET_EVENT_KPIS`/`SET_COST_BREAKDOWN`), `src/api/endpoints/analyse.api.js`, `src/data/analyseApiMock.js` (39KB, plus aucun import) et sa spec. Notes de tombstone laissées en commentaire aux points de suppression. `shopSummaries`/`spaceMenuByConfig`/`shopMenusByShop` (voisins du même plan) **conservés** — usage non audité cette session.

## Risque de régression / à surveiller

Grep post-suppression : zéro référence restante. Vérifier que la suite unit passe (une spec du mock supprimée avec lui).

## Références

- `api-datafriday-staging/docs/bugs/89_analyse_swagger_faux_spaceid_ignore.md`
