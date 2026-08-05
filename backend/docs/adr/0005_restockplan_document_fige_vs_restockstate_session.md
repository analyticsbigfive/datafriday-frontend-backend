# ADR-0005 — Séparer le plan de réarmement (document figé) de l'état de session

- **Statut** : Accepté
- **Date** : 2026-08-04
- **Domaine** : Stock / Réarmement — modèle de données

## Contexte

Le Réarmement (`SpaceRestockView`) calcule ses trois étapes — réglages de stock, tableau « à
déposer », feuille de course — **entièrement en computeds Vue**, à partir des prédictions Event
Predict, des comptages Inventory, du catalogue menu items/composants et des market prices.
Rien de ce qui est calculé n'est écrit : `generateRestockTable()` et `generateShoppingList()`
positionnent deux booléens, pas une ligne de données.

La seule persistance est `RestockState` : **une ligne par (tenantId, spaceId)**, écrasée à chaque
frappe via un PUT débouncé, qui porte les entrées (sélection d'events, ajustements %, exclusions,
cases confirmées) et l'étape courante. C'est de la mémorisation de session — le module
`frontend/docs/modules/06_STOCK_INVENTAIRE.md` le dit explicitement : « ce n'est pas du stock ».

Conséquence signalée par l'owner le 2026-08-04 : *« les plans de réapprovisionnement ne sont pas
sauvegardés, ce qui empêche les modifications et le suivi »*. Un plan validé et envoyé au
fournisseur la semaine dernière se réaffiche aujourd'hui avec d'autres chiffres dès qu'une
prédiction, un prix ou une recette a bougé — et il n'existe aucune trace de ce qui avait été
décidé.

Alternative sérieusement envisagée et écartée : **étendre `RestockState`** (y stocker N plans, ou
y ajouter les lignes calculées). Écartée pour deux raisons vérifiables : la table est écrite par un
watcher profond à chaque frappe (y faire transiter des centaines de kilo-octets ferait sauter le
limiteur de débit), et sa clé `@@unique([tenantId, spaceId])` interdit par construction plus d'un
document par espace.

## Décision

Créer une table **`RestockPlan`** : un plan de réarmement est un **document nommé, figé, scopé
espace**, distinct de l'état de session.

- **Figé** : `stockLines`, `restockLines`, `shoppingGroups` et `recipeCoeffs` sont la **photo** des
  lignes calculées au moment de la sauvegarde. Rouvrir un plan ne recalcule jamais ces nombres.
- **Éditable** : les corrections manuelles vivent dans `lineOverrides` (rowKey → quantité), à côté
  des lignes d'origine et non à leur place, pour que « calculé » et « corrigé à la main » restent
  distinguables. La feuille de course est recalculée à partir des **coefficients d'explosion figés**
  (`recipeCoeffs`), jamais du catalogue vivant.
- **Scopé espace** : un plan couvre N évènements (le réarmement travaille déjà sur une sélection
  multiple). Pas de contrainte d'unicité sur le nom.
- **Écriture explicite** : un plan n'est enregistré que sur action utilisateur. Aucun auto-save.
- `RestockState` reste inchangé dans sa nature et gagne un seul champ, `loadedPlanId`, pour que la
  session retrouve le plan ouvert après un rechargement.

## Conséquences

- Un plan sauvegardé est **opposable** : il dit ce qui a été décidé à une date, quelles qu'aient
  été les évolutions du catalogue depuis. C'est le but ; c'est aussi la contrepartie — un vieux
  plan peut citer un prix ou une recette qui n'existent plus. L'écran affiche donc en permanence
  qu'il montre une photo, avec sa date (`meta.snapshotAt`).
- **Un plan n'est pas une source de stock**, exactement comme `RestockState`. Ne jamais le lire
  pour répondre à « combien reste-t-il ? ».
- Ce qui devient interdit : faire transiter les lignes figées par `RestockState` (le watcher
  profond les ré-enverrait à chaque frappe), et recalculer en silence une photo quand une entrée
  change — toute mutation invalidante passe par une confirmation explicite.
- La table est un blob JSON assumé : pas de requête analytique dessus, pas de jointure. Les seuls
  champs interrogeables sont les métadonnées (`name`, `selectedEventIds`, compteurs, dates), que le
  `GET` de liste sélectionne explicitement pour ne jamais transporter les photos.
- Comme toute évolution de schéma ici, la migration est **manuelle** (ADR-0002) : le SQL doit être
  appliqué avant le déploiement du module backend, sous peine de 500 P2021 en production — le
  scénario de la fiche 248-01.

## Références

- Migration : `backend/prisma/sql/2026-08-04_restockplan.sql` (registre `prisma/sql/README.md` #11)
- [ADR-0002](0002_migrations_manuelles_jamais_plateforme.md) — migrations toujours manuelles
- `frontend/docs/modules/06_STOCK_INVENTAIRE.md` — le Réarmement et `RestockState`
- Pattern de référence pour les documents figés : `StockReconciliation` ; pour les versions
  nommées éditables : `EventPredictVersion` + `frontend/src/composables/useEventPredictVersions.js`

---

JLH
