# Handoff Front — Teams / équipes sport (étape F1)

> Backend prêt : table `Team`, colonnes équipe sur `Event`, routes `/teams` (NestJS).
> Réf : [docs/jl/BACKEND_TEAMS_EVENTS.md](./jl/BACKEND_TEAMS_EVENTS.md) §5 et [DESIGN_TEAMS_SPORT_EVENTS.md](./jl/DESIGN_TEAMS_SPORT_EVENTS.md) §2bis.
> ⚠️ Déployer le backend (migration incluse) AVANT de livrer ces changements front.

## 1. Nouvelles routes NestJS (base `api/v1`, JWT Supabase comme le reste)

| Méthode | Route | Body / Query | Retour | Permission |
|---|---|---|---|---|
| `GET` | `/teams` | `?eventCategoryId=&eventSubcategoryId=` (optionnels) | `Team[]` (tableau nu, PAS `{ data }`) | authentifié |
| `POST` | `/teams` | `{ name, eventCategoryId?, eventSubcategoryId? }` | `Team` créée (409 si doublon même compétition) | `menu.events.manage` |
| `PATCH` | `/teams/:id` | `{ name?, eventCategoryId?, eventSubcategoryId? }` | `Team` | `menu.events.manage` |
| `DELETE` | `/teams/:id` | — | `Team` supprimée (les events gardent `visitingTeamName` en repli) | `menu.events.manage` |

`Team = { id, name, tenantId, eventCategoryId, eventSubcategoryId, createdAt, updatedAt }`

**Filtrage serveur** : si `eventCategoryId`/`eventSubcategoryId` sont passés, le backend renvoie les équipes de la compétition **+ les équipes génériques** (les deux scopes null). Le filtre client `getFilteredTeams` peut donc être remplacé par un appel filtré, ou gardé — mais avec les **nouveaux noms de champs** (`eventCategoryId`/`eventSubcategoryId`, plus `sportCategoryId`/`subcategory` du make-server mort).

## 2. Champs équipe sur `Event` (PATCH/POST `/events`)

- `homeTeamName` (texte libre), `visitingTeamId` (FK), `visitingTeamName` (dénormalisé) sont maintenant **acceptés et persistés** ; ils sont aussi renvoyés par GET `/events` (+ objet `visitingTeam` inclus).
- `visitingTeamName` est **dérivé côté serveur** dès que `visitingTeamId` est posé — inutile de l'envoyer.
- **Désassigner une équipe = envoyer `visitingTeamId: null` explicitement.** Le code actuel ne le permet pas : le guard `has()` de `buildEventPatchPayload` (EventPredictView) écarte les null, et `EventDetailsEditor` mappe `'none' → undefined` (L616). À corriger pour que « None » soit persistable.
- `visitingTeamId` inconnu ou d'un autre tenant → `404 Team not found` (le PATCH entier échoue).

## 3. Pièges

1. **NE PAS envoyer `tenantId` dans POST `/teams`** (contrairement au contrat legacy make-server). Le tenant vient du JWT ; `forbidNonWhitelisted` renvoie 400 sur tout champ non listé.
2. **GET `/teams` renvoie un tableau nu**, pas `{ data: [...] }` — le legacy `result.data || []` renverrait toujours `[]`.
3. Jusqu'au déploiement front, saisir un « Home Team Name » + Save fait échouer **tout** le PATCH en 400 côté ancien backend (champs non whitelistés). Le nouveau backend corrige ça dès son déploiement, même sans changement front.

## 4. Checklist F1 (spec §5)

- [ ] Créer `src/api/endpoints/team.api.js` : `getTeams(params)`, `createTeam`, `updateTeam`, `deleteTeam` (axios, mirror des autres wrappers).
- [ ] `EventPredictView.vue` (loadAll) : remplacer `eventApi.getTeams()` par le wrapper.
- [ ] `EventsView.vue` : rebrancher `getFilteredTeams` (nouveaux noms de champs) + dialog « Add New Team » (gérer le 409 doublon).
- [ ] Supprimer `getTeams`/`createTeam` de `src/utils/eventApi.js` (make-server morte).
- [ ] Permettre `visitingTeamId: null` dans le payload PATCH (désassignation).
- [ ] Unifier le gating UI : champs team visibles si `isSportType` OU `EventCategory.hasHomeTeam` (design §3).
