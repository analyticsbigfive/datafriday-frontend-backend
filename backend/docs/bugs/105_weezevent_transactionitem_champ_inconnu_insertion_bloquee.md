# BUG-105 — `WeezeventTransactionItem` jamais inséré : mauvais nom de champ (`weezeventItemId` au lieu de `externalItemId`)

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🔴 Bloquant/impact business (aucune donnée article/ligne de vente insérée, sur les
  deux mécanismes de sync Weezevent)
- **Domaine** : Intégrations & ventes (Weezevent — insertion des lignes de transaction)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (backend)
- **Découvert le** : 2026-07-20, en creusant BUG-104 (le job de sync par job restait bloqué à
  "0 inséré" même après correction de l'`organizationId` manquant)
- **Fichiers** :
  - `src/features/weezevent/services/weezevent-incremental-sync.service.ts:854` (sync par lot,
    utilisé par le mécanisme A legacy et par le mécanisme B job/bissection via
    `WeezeventInsertWorkerService.processChunk` → `insertTransactionBatch`)
  - `src/features/weezevent/services/sync/transaction-sync.service.ts:426`
    (`upsertTransactionItems`, appelé par `syncSingleTransaction` — le chemin webhook temps réel)

## Symptôme

Après correction de BUG-104, une sync par job progressait bien en phase 1 (collecte : ex. 1 824
transactions collectées) mais restait bloquée à **"0 / N" en phase 2 (insertion)** indéfiniment —
avant le fix de BUG-104 sur `WeezeventInsertWorkerService.watch()` (garde-fou "0 chunk PENDING +
collecte terminée + chunks manquants → job FAILED"), le job ne se terminait jamais et semblait
juste "en cours" pour toujours.

Vérifié directement en base (les logs `[InsertWorker]`/`Logger.error()` de ce service n'apparaissent
pas dans la sortie console consultée par l'utilisateur, cause non identifiée séparément — la
persistance de l'erreur en base, ajoutée pendant ce diagnostic, a été la voie de résolution) :
- `WeezeventTransaction` (les transactions elles-mêmes) : **1 824 lignes bien présentes** pour la
  période testée — l'étape 5 (`salesTransaction.createMany`) réussit.
- `WeezeventTransactionItem` (les lignes de détail/articles) : **0 ligne** pour ces mêmes
  transactions — l'étape 6 (`salesTransactionItem.createMany`) échoue systématiquement, après
  l'étape 5, faisant remonter tout le chunk en erreur alors que les transactions étaient déjà
  insérées avec succès.

## Cause racine

Le modèle Prisma expose le champ sous le nom `externalItemId`, la colonne SQL physique s'appelant
`weezeventItemId` uniquement via `@map` :

```prisma
model SalesTransactionItem {
  externalItemId String? @map("weezeventItemId")
  ...
}
```

Les deux services construisaient l'objet à insérer avec la clé `weezeventItemId` (le nom de la
colonne DB) au lieu de `externalItemId` (le nom du champ côté Prisma Client) :

```ts
// AVANT (les deux fichiers)
itemsToInsert.push({ transactionId, weezeventItemId: row.id.toString(), ... })
```

Prisma Client valide les clés d'un objet `data` contre les noms de champs du modèle, pas contre les
noms de colonnes SQL — `weezeventItemId` n'existe pas comme champ, donc chaque appel
`salesTransactionItem.createMany(...)` levait une erreur de validation côté client (« Invalid
`...createMany()` invocation », avant même d'atteindre la base). Ironie : dans
`transaction-sync.service.ts`, la lecture juste après (ligne 444, `select: { id: true,
externalItemId: true }`) utilise déjà le bon nom — seule l'écriture avait la faute de frappe.

Confirmé présent depuis le tout premier commit suivi de ce repo (`8bf2429`, import initial
2026-07-15) dans les deux fichiers — bug de longue date, pas une régression récente.

## Correction

Renommé `weezeventItemId` → `externalItemId` dans les deux fichiers, aux deux points d'écriture
(sync par lot et sync temps réel webhook). Aucun autre point d'écriture trouvé (`digifood-
ingestion.service.ts` utilise déjà `externalItemId` correctement — Digifood n'est pas concerné).

Le pipeline gère déjà le rattrapage sans action manuelle : la collecte des lignes
(`itemsByTxWeezeventId`) se fait pour **toutes** les transactions validées rencontrées, y compris
celles déjà existantes en base (commentaire du code : "backfill missing items") — relancer une sync
sur une période déjà couverte comble donc automatiquement les lignes manquantes pour les
transactions déjà présentes, sans purge ni migration de données nécessaire.

## Risque de régression / à surveiller

- **Portée potentiellement large** : ce bug touchait le chemin d'insertion des lignes de vente pour
  **toutes** les intégrations Weezevent, sur les **deux** mécanismes de sync (legacy incrémental et
  job/bissection) — toute donnée au niveau article jamais correctement enregistrée avant ce fix
  devra être rattrapée par une resynchronisation. À date, seule l'intégration de test de cette
  session (`cmqxx7ch900014wpdle9h764p`, "Aix Arena"/tenant Big Five) a été vérifiée comme concernée
  concrètement (0 item pour 1 824 transactions).
- **Sans lien avec BUG-103** malgré un symptôme de surface proche ("articles vides côté Analyse") :
  BUG-103 concerne une jointure trop stricte en lecture (`event-timeline`) sur un tenant où les
  items existaient bel et bien en base (28 791 lignes pour Auxerre) — un problème de restitution,
  pas d'insertion. À vérifier séparément si d'autres tenants montrent des symptômes façon BUG-103
  qui seraient en réalité dus à une absence totale d'items (ce bug-ci) plutôt qu'à la jointure.
- Le test `weezevent-sync.service.spec.ts:140` mocke `salesTransactionItem.findMany` avec
  `weezeventItemId` au lieu de `externalItemId` — mock non type-checké par Prisma (donc n'aurait
  jamais pu détecter ce bug), pas corrigé dans cette passe (portée : fix de production uniquement).
- **Ajout non-schema-changing associé** : `WeezeventSyncChunk.errorMessage` (colonne `TEXT`
  nullable, ajoutée via `ALTER TABLE` direct + `prisma db push` a été refusé à cause d'un drift de
  schéma préexistant sans rapport — voir note ci-dessous) — permet désormais de diagnostiquer un
  futur échec de chunk directement en base, sans dépendre des logs serveur.
- **Dette découverte en marge, non traitée ici** : `prisma migrate dev`/`db push` échouent tous
  les deux sur ce projet à cause d'un drift de schéma préexistant — une migration historique
  référence une table `ExternalMerch` qui n'existe plus (shadow DB), et le schéma actuel a retiré
  des colonnes (`MenuItem.spaceIds`/`spacePrices`, `WeezeventIntegration.clientId/clientSecret/
  organizationId`) que la vraie base porte encore avec des données non nulles. Aucune migration
  Prisma standard ne pourra tourner tant que ce drift n'est pas résolu explicitement (décision
  produit : supprimer pour de bon ces colonnes gelées, ou les remettre dans le schéma).

## Références

- BUG-104 (`104_weezevent_sync_job_organizationid_manquant.md`) — corrigé juste avant celui-ci,
  dans la même session de diagnostic.
- BUG-103 (`103_event_timeline_articles_vides_jointure_mapping.md`) — symptôme de surface proche,
  cause différente, à ne pas confondre.
- `docs/modules/05_INTEGRATIONS_VENTES.md` (Piège n°2, les 3 mécanismes de sync Weezevent).
