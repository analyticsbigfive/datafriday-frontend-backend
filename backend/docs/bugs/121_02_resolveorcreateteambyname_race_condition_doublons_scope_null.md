# BUG-121-02 — `resolveOrCreateTeamByName` : race condition crée des équipes en double quand le scope compétition est NULL/NULL

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-29, constaté par l'utilisateur (dropdown "Visiting Team" affichant
  "Paris Basket Ball" deux fois) après un import CSV réel via [[120_02_eventsservice_resolveorcreateteambyname]].
  Confirmé en base : deux lignes `Team` avec le même `name`, `tenantId`, `eventCategoryId: null` et
  `eventSubcategoryId: null`, créées à 1ms d'écart.
- **Fichiers** : `src/features/events/events.service.ts` (`resolveOrCreateTeamByName`)

## Symptôme

Après un import CSV où plusieurs lignes partagent le même nom d'équipe (`homeTeamName`) sans
catégorie mappée (donc `eventCategoryId`/`eventSubcategoryId` tous deux `null`), la table `Team`
se retrouve avec deux entrées identiques pour le même nom.

## Cause racine

`resolveOrCreateTeamByName` (introduite par [[120_02_eventsservice_resolveorcreateteambyname]])
fait un `findFirst` puis un `create` si rien n'est trouvé, avec un filet `P2002` en cas de conflit
sur la contrainte `@@unique([tenantId, eventCategoryId, eventSubcategoryId, name])`. Ce filet ne
protège que le cas **scopé** (catégorie/sous-catégorie renseignées) — déjà documenté comme
limitation par **BUG-70** : Postgres traite `NULL` comme distinct de tout autre `NULL` dans un
index unique, donc deux lignes `(tenantId, NULL, NULL, "Paris Basket Ball")` ne violent jamais la
contrainte, même créées en parallèle. Un import CSV concurrent (`IMPORT_CONCURRENCY = 5`, voir
`CsvImportDrawer.vue`) avec plusieurs lignes du même nom d'équipe non catégorisée déclenche
systématiquement ce cas : les deux requêtes passent le `findFirst` avant que l'une des deux ne
commit son `create`.

## Correction

Ajout d'un verrou en mémoire (single-flight) au niveau de l'instance `EventsService` — un
singleton Nest, donc une seule instance sert toutes les requêtes HTTP d'un même process : une
`Map<string, Promise<Team>>` statique, clé `tenantId + eventCategoryId + eventSubcategoryId + nom
normalisé (lowercase)`. Tout appel concurrent pour la même clé reçoit la **même** promesse en vol
au lieu de relancer indépendamment `findFirst`/`create` ; le premier appelant à terminer peuple le
cache pour la suite (retiré de la map dans un `finally`, donc pas de pollution entre imports).

Le filet `P2002` existant est conservé (utile si plusieurs instances/process du backend tournent
en parallèle — le verrou en mémoire ne couvre qu'un seul process), mais n'est plus la seule ligne
de défense pour le cas scopé.

## Risque de régression / à surveiller

- Le verrou est **par process** : dans un déploiement multi-instance, deux requêtes arrivant sur
  deux instances différentes en même temps et scopées NULL/NULL peuvent encore créer un doublon
  (limitation résiduelle de BUG-70, hors de portée d'un fix applicatif seul — la vraie correction
  serait un index unique partiel Postgres `WHERE eventCategoryId IS NULL AND eventSubcategoryId IS
  NULL`, à discuter avant migration de schéma).
- Suite `jest src/features/events` : 68/68 verts, `npx tsc --noEmit` propre (une erreur préexistante
  et sans rapport dans `inventory.service.spec.ts`, non touchée par ce fix).
- Le serveur backend local tourne via `pnpm start` (sans `--watch`) — redémarrage manuel requis
  avant de tester ce correctif en conditions réelles.
- Les deux lignes "Paris Basket Ball" déjà en base (tenant de test) ne sont pas nettoyées par ce
  fix — doublon existant à traiter séparément (script de wipe ou suppression manuelle).

## Références

- [[120_02_eventsservice_resolveorcreateteambyname]] — introduit `resolveOrCreateTeamByName`,
  origine du bug.
- BUG-70 (`schema.prisma`, commentaire sur `Team.@@unique`) — limitation NULL≠NULL déjà documentée,
  jamais adressée par une contrainte DB.
