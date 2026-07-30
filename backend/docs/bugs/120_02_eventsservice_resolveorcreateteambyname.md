# BUG-120-02 — `EventsService` : résolution/création automatique des équipes par nom (`homeTeamName`/`visitingTeamName`), déplacée du frontend

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-28 — fiche miroir de
  `datafriday-web/docs/bugs/253_02_csvimportdrawer_teams_jamais_relies_catalogue.md`.
- **Fichiers** : `src/features/events/events.service.ts` (`resolveEventTeamFields`,
  `resolveOrCreateTeamByName`, `findExistingTeam`, `createTeam` refactoré pour réutiliser
  `findExistingTeam`), `src/features/events/events.service.spec.ts`

## Contexte

Cf. la fiche frontend miroir pour le symptôme complet (Home/Visiting Team jamais reliés au
catalogue `Team` après import CSV). Une première version du correctif résolvait/créait les
équipes côté frontend (`GET /teams` + N `POST /teams` avant chaque import). Question soulevée par
l'utilisateur : est-ce la bonne couche ? Réponse : non — un aller-retour réseau supplémentaire par
équipe depuis le navigateur est évitable, et Team n'a pas besoin de suivre un pattern différent
(auto-création par nom) de celui de Type/Catégorie/Sous-catégorie (résolution stricte par ID côté
client) tant que ça reste circonscrit au **texte libre** déjà accepté par le DTO
(`homeTeamName`/`visitingTeamName`) — pas une nouvelle divergence de contrat.

## Correction

`resolveEventTeamFields(dto, tenantId, scope)` (privée, appelée par `create()`/`update()`) :

- **`homeTeamName`** (toujours texte, pas de FK côté `Event`) : si non vide, résout-ou-crée
  l'équipe via `resolveOrCreateTeamByName()` puis persiste `team.name` (normalise la casse sur une
  équipe déjà existante). Assure l'existence du catalogue pour le reverse-lookup front
  (`EventFormDrawer.resolveHomeTeamId`), qui ne dépendait jusqu'ici que d'une correspondance
  fortuite.
- **`visitingTeamName`** (repli quand `visitingTeamId` n'est pas fourni) : même résolution, pose
  ensuite `visitingTeamId` **et** `visitingTeamName` (cohérent avec la branche `visitingTeamId`
  existante, prioritaire).
- **`visitingTeamId` explicite** : comportement inchangé (validation d'appartenance tenant via
  `findOwnedTeamOrThrow`).

`resolveOrCreateTeamByName(tenantId, name, eventCategoryId, eventSubcategoryId)` (nouvelle
méthode privée) : recherche insensible à la casse scopée compétition
(`findExistingTeam`, factorisé et réutilisé par `createTeam()` pour éliminer la duplication de
requête) ; crée si absente ; rattrape un `P2002` (contrainte `@@unique`, BUG-70) par un refetch
plutôt que de laisser remonter une 500.

**Scope de compétition sur une mise à jour partielle** : `update()` passe désormais
`{ eventCategoryId: existing.eventCategoryId, eventSubcategoryId: existing.eventSubcategoryId }`
en repli à `resolveEventTeamFields` — sans ça, un PATCH qui ne retouche que le nom d'équipe (sans
retransmettre la taxonomie) aurait résolu/créé l'équipe hors de toute compétition (scope
`null`/`null`) au lieu de respecter celle déjà en place sur l'event.

## Risque de régression / à surveiller

- `resolveOrCreateTeamByName` utilise `team.name` (la valeur canonique en catalogue) plutôt que le
  texte brut reçu quand une correspondance existante est trouvée — normalise volontairement la
  casse/l'espacement entre deux imports du même nom ("AJ Auxerre" vs "aj auxerre" convergent vers
  la même entrée et le même texte affiché). Documenté via un test dédié
  (`réutilise une équipe déjà présente au lieu d'en recréer une`).
- Suite `jest src/features/events` : 68/68 verts, y compris 2 tests mis à jour/ajoutés pour ce
  comportement (`events.service.spec.ts`, describe `event team fields`).
- `npx tsc --noEmit` propre.
- Le serveur backend local tourne via `pnpm start` (sans `--watch`, cf.
  [[119_02_createeventdto_sessions_array_objets_reduit_a_vide_class_transformer]]) — un nouveau
  redémarrage manuel est requis avant de tester ce correctif en conditions réelles ; non encore
  vérifié via une vraie requête HTTP au moment de la rédaction.

## Références

- `datafriday-web/docs/bugs/253_02_csvimportdrawer_teams_jamais_relies_catalogue.md` — fiche
  miroir frontend (historique complet de la décision, y compris la version initiale côté client).
- [[119_02_createeventdto_sessions_array_objets_reduit_a_vide_class_transformer]] — même
  contrainte de redémarrage backend.
