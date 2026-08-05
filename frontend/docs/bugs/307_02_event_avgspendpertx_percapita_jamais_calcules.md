# BUG-307-02 — `Event.avgSpendPerTx` jamais calculé par le pipeline d'agrégation (Per Capita légitimement vide sans billetterie)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements / Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-08-05 (signalé par l'utilisateur : "Avg Spend/Tx" et "Per Capita" vides dans la fiche d'un event live malgré Revenue/Transactions renseignés)
- **Fichiers** : `backend/src/features/aggregation/aggregation.service.ts:436-452` (`executeProcessEvents`)

## Symptôme

Dans le drawer d'édition d'un event (section "Données financières"), `Revenue`/`Transactions`
affichent des valeurs correctes (989,49€ / 201) mais `Avg Spend / Tx` et `Per Capita` restent
vides, alors que le premier est un simple dérivé des deux champs déjà présents.

## Cause racine

BUG-033 (corrigé précédemment) avait branché l'écriture de `Event.revenue`/`transactionCount`
depuis le rollup `SpaceRevenueMinuteAgg` dans le pipeline d'agrégation automatique
(`executeProcessEvents`), mais **jamais** celle de `avgSpendPerTx`/`perCapita` — ces deux colonnes
ne pouvaient être posées que par une édition manuelle du formulaire (`events.service.ts`, passthrough
DTO). `EventFormDrawer.vue` lit directement `initialEvent.avgSpendPerTx`/`.perCapita` (colonnes
brutes), sans repli de calcul côté front.

## Correction

`executeProcessEvents` calcule et écrit désormais :
- `avgSpendPerTx = revenue / transactionCount` (arrondi 2 décimales), `null` si aucune transaction
  (pas de division par zéro).
- `perCapita = revenue / attendees` où `attendees = event.ticketsScanned ?? event.ticketsSold`,
  **`null`** (pas `0`) si aucune donnée de billetterie réelle n'existe — c'est le cas normal pour un
  event QA simulé (`LiveSaleSimulatorWidget`), qui n'a jamais de vrai scan de billet. Pour un event
  réel, `perCapita` se peuple automatiquement dès que le sync attendees (déjà en place, cf.
  commentaire `aggregation.service.ts:468-470`) a écrit `ticketsScanned`/`ticketsSold`, au prochain
  passage du job.

## Risque de régression / à surveiller

Ne pas confondre `null` (donnée non disponible) et `0` (donnée disponible et nulle) sur ces deux
champs — le repli `null` est intentionnel pour ne pas afficher un "Per Capita : 0,00€" trompeur sur
un event sans billetterie. Tests : 3 nouveaux dans `aggregation.service.spec.ts` (avgSpendPerTx
calculé + division par zéro, perCapita null sans billetterie, perCapita calculé avec
`ticketsScanned`).

## Références

- BUG-033 (mécanisme d'origine, revenue/transactionCount).
- `docs/modules/11_LIVE.md` (contexte : trouvé en testant le module Live).
