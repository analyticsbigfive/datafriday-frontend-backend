# Backend — Spécification « Teams / Équipes » pour les events sport

> ## 🟢 En clair (à lire en premier)
>
> **Le problème** : dans l'app, on ne peut pas choisir l'**équipe visiteuse** d'un match (le menu déroulant est vide, aussi bien dans EventPredict que dans `/events`).
>
> **Pourquoi** : trois manques côté base/API —
> 1. il n'existe **pas de table `Team`** dans la base ;
> 2. la table `Event` **n'a pas de colonnes équipe** (`visitingTeamId`, `homeTeamName`) ;
> 3. l'ancien service qui fournissait les équipes (make-server du projet Supabase `uvxx`) est **mort**.
>
> **Pourquoi c'est important** : l'algorithme de prédiction donne un **gros bonus (+800 points)** quand un match futur retrouve un match passé contre la **même équipe visiteuse**. Sans équipe assignable, ce bonus ne se déclenche jamais → prédictions sport moins précises.
>
> **Ce qu'on te demande (backend)** :
> 1. Créer une table **`Team`** (nom + rattachée à une compétition/catégorie + tenant).
> 2. Ajouter sur **`Event`** les colonnes `visitingTeamId` (lien vers Team) et `homeTeamName` (texte).
> 3. Exposer **`GET /teams`** (liste, filtrable par compétition) et **`POST /teams`** (créer).
> 4. Faire en sorte que **`PATCH /events/:id`** accepte et enregistre les champs équipe (aujourd'hui envoyés par le front mais ignorés).
> 5. Idéalement, **alimenter les équipes depuis Weezevent** (le champ existe déjà côté enrichissement) — voir §4.2.
>
> Le frontend est déjà prêt : dès que `/teams` répond, les menus se remplissent tout seuls. Détails techniques ci-dessous.

**Statut** : à implémenter côté backend NestJS/Prisma (repo `api-datafriday`, projet Supabase **alsgd** = `alsgdtewqeldrrquypdy`).
**Contexte** : le frontend attend déjà des « teams » (équipe visiteuse + home team) mais **aucune table `Team` n'existe** et l'`Event` **n'a pas de colonnes team**. L'ancien endpoint `/teams` vivait sur la make-server Edge Function du projet Supabase **uvxx** (`uvxxnusnwhhzyxsffemp`), aujourd'hui **MORT** (500/522). D'où : dropdown équipe vide dans EventPredict et dans `/events`.

Ce document décrit le contrat frontend EXACT et les changements backend nécessaires. Voir aussi [DESIGN_TEAMS_SPORT_EVENTS.md](./DESIGN_TEAMS_SPORT_EVENTS.md) pour la conception d'ensemble.

---

## 1. Constat (preuves)

| Élément | État actuel | Preuve |
|---|---|---|
| Table `Team` | **absente** du schéma Prisma alsgd | schéma prod (aucune table `Team`) |
| Colonnes team sur `Event` | **absentes** (`visitingTeamId`, `homeTeamName`, `visitingTeamName`) | schéma `Event` = name, eventDate, spaceId, configurationId, eventTypeId/CategoryId/SubcategoryId, tickets…, **pas de team** |
| Flag `EventCategory.hasHomeTeam` | **existe** mais inexploité bout-en-bout | schéma `EventCategory.hasHomeTeam boolean` |
| `GET /teams`, `POST /teams` | pointent la make-server Edge (projet **uvxx mort**) | `src/utils/eventApi.js` `getTeams`/`createTeam` → `apiCall('/teams')` |
| PATCH event envoie déjà les champs team | oui, mais **droppés** (colonnes absentes) | `src/components/EventPredictView.vue` `buildEventPatchPayload` → `homeTeamName`, `visitingTeamId` |
| Scoring prédictif utilise team | oui, **poids 800** | `src/utils/predictiveAnalytics.js` `WEIGHTS.visitingTeam = 800`, match `event.visitingTeamId` |

**Conséquence produit** : un event sport (ex. CIV Ligue 1) ne peut pas se voir assigner d'équipe visiteuse → le bonus de similarité 800 ne se déclenche jamais → prédictions moins précises pour le sport.

---

## 2. Contrat frontend (à satisfaire, NE PAS casser)

### 2.1 Entité `Team` attendue
Le frontend liste et filtre les équipes **par compétition** :

```
getFilteredTeams(eventCategoryId, eventSubcategoryId)  // src/components/EventsView.vue
```

→ une `Team` est rattachée à une **catégorie** et/ou **sous-catégorie** d'event (Ligue 1 ≠ Handball). Champs minimaux consommés par l'UI : `{ id, name }`. Champs de scoping requis pour le filtrage : `eventCategoryId`, `eventSubcategoryId` (nullable).

### 2.2 Endpoints appelés par le frontend
| Méthode | Route | Appelé par | Payload / retour attendu |
|---|---|---|---|
| `GET` | `/teams` | `eventApi.getTeams()` | `{ data: Team[] }` ou `Team[]` (le front fait `result.data || []`) |
| `POST` | `/teams` | `eventApi.createTeam(team)` | body `{ name, eventCategoryId?, eventSubcategoryId?, tenantId }` |

> Note : ces wrappers sont aujourd'hui dans `src/utils/eventApi.js` (fetch → make-server). Ils devront pointer NestJS (voir §5).

### 2.3 Champs team sur l'`Event`
Le frontend lit/écrit sur l'objet event :
- `homeTeamName` : **texte libre** (`<v-text-field>` — l'équipe « maison » est saisie, pas un FK). `EventDetailsEditor.vue` L143-151.
- `visitingTeamId` : **FK** vers `Team.id` (`<v-select :items="teamOptions">`). L154-165, `onVisitingTeamChange`.
- `visitingTeamName` : optionnel, dénormalisé (utilisé en repli d'affichage / dérivation référentiel — `ensureReferentialsFromEvents` L4325).

`buildEventPatchPayload` (EventPredict) whiteliste et envoie `homeTeamName` + `visitingTeamId` dans `PATCH /events/:id`. Le backend doit les **accepter et persister**.

---

## 3. Changements Prisma (migration)

### 3.1 Nouvelle table `Team`
```prisma
model Team {
  id                 String   @id @default(cuid())
  name               String
  tenantId           String
  // Scoping compétition (pour getFilteredTeams). Nullable = équipe générique.
  eventCategoryId    String?
  eventSubcategoryId String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  tenant       Tenant            @relation(fields: [tenantId], references: [id])
  category     EventCategory?    @relation(fields: [eventCategoryId], references: [id])
  subcategory  EventSubcategory? @relation(fields: [eventSubcategoryId], references: [id])
  visitingFor  Event[]           @relation("EventVisitingTeam")

  @@index([tenantId])
  @@index([eventCategoryId])
  @@index([eventSubcategoryId])
}
```

### 3.2 Colonnes team sur `Event`
```prisma
model Event {
  // … champs existants …
  homeTeamName    String?
  visitingTeamId  String?
  visitingTeamName String?   // dénormalisé optionnel (affichage/repli)

  visitingTeam    Team?      @relation("EventVisitingTeam", fields: [visitingTeamId], references: [id])
}
```

> `homeTeam` reste **texte** (conforme au front actuel). Normalisation en FK possible plus tard (voir design §Évolutions).

### 3.3 Migration
- `prisma migrate dev --name add_teams_and_event_team_fields` (dev) puis **`prisma migrate deploy` sur Render** (rappel : historiquement des migrations n'ont jamais été jouées en prod → 500 « table absente »).
- Rétro-compat : colonnes nullable → pas de backfill obligatoire. Events existants restent valides (`visitingTeamId = null`).

---

## 4. Endpoints NestJS `/teams`

| Méthode | Route | Query / Body | Retour |
|---|---|---|---|
| `GET` | `/teams` | `?eventCategoryId=&eventSubcategoryId=` (optionnels → filtrage) | `Team[]` (scopé au tenant du JWT) |
| `POST` | `/teams` | `{ name, eventCategoryId?, eventSubcategoryId? }` | `Team` créée |
| `PATCH` | `/teams/:id` | `{ name?, eventCategoryId?, eventSubcategoryId? }` | `Team` |
| `DELETE` | `/teams/:id` | — | `204` |

Règles :
- **Scope tenant** : filtrer par `tenantId` du JWT (comme les autres entités). Ne jamais fuiter les teams d'un autre tenant.
- **Filtrage** : si `eventCategoryId`/`eventSubcategoryId` fournis → renvoyer les teams de cette compétition **+** les teams génériques (`eventCategoryId IS NULL`). Sinon → toutes les teams du tenant.
- **DTO** : autoriser les champs ci-dessus (class-validator `whitelist` ne doit pas les stripper).

### 4.1 PATCH `/events/:id` — accepter les champs team
Le contrôleur/DTO `PATCH /events/:id` doit **whitelister et persister** `homeTeamName`, `visitingTeamId`, `visitingTeamName`. Aujourd'hui ils arrivent mais sont ignorés (colonnes absentes + DTO qui les strippe).

---

### 4.2 Provenance des équipes (peuplement du catalogue `Team`)
Voir [DESIGN_TEAMS_SPORT_EVENTS.md §2bis](./DESIGN_TEAMS_SPORT_EVENTS.md). Résumé priorisé :
1. **Weezevent (faisable, vérifié)** — le champ team existe déjà en enrichissement `WeezeventEvent` (`updateWeezeventEventMetadata({ team?, visitingTeam? })`, `PATCH /spaces/:id/weezevent-events/:eventId`). Dériver/upsert `Team` depuis ces métadonnées (nom → `Team` scopée compétition), au sync ou à la volée.
2. **Migration DataFridayFM (À CONFIRMER)** — système externe, **absent de ce dépôt** ; valider le schéma source (table équipes ? mapping compétition ? jointure events ?) avec l'équipe DataFridayFM avant tout script de migration. Ne pas présumer.
3. **Seed manuel** — repli (ex. clubs Ligue 1) + dialog « Add New Team ».

## 5. Changements frontend (à faire APRÈS le backend) — **OBLIGATOIRE pour voir les équipes**

> ⚠️ Le backend seul ne peuple **PAS** les dropdowns. Aujourd'hui `EventsView` (L1248/1441) **et** `EventPredictView` lisent `eventApi.getTeams()`/`createTeam()` = make-server **morte**. Sans ce rebranchement, les selects restent vides même backend prêt.

1. Créer `src/api/endpoints/team.api.js` (axios/NestJS, mirror des autres wrappers) : `getTeams(params)`, `createTeam`, `updateTeam`, `deleteTeam`.
2. Remplacer dans `EventPredictView.vue` (loadAll) l'appel `eventApi.getTeams()` (make-server mort) par le wrapper NestJS — **import dynamique** au call-site si depuis le store, sinon import statique OK dans le composant (voir la règle « pas d'axios statique dans un module store »).
3. `EventsView.vue` : rebrancher `getFilteredTeams` / dialog « Add New Team » sur le wrapper NestJS.
4. Supprimer les fonctions `/teams` de `src/utils/eventApi.js` (make-server).

---

## 6. Vérification (definition of done)

- [ ] `GET /teams` (NestJS) renvoie 200 + `Team[]` scopé tenant ; filtré par category/subcategory.
- [ ] `POST /teams` crée et renvoie la team.
- [ ] `PATCH /events/:id` persiste `visitingTeamId` + `homeTeamName` (relire l'event → champs présents).
- [ ] Front : dropdown « Visiting Team » peuplé dans EventPredict + `/events` (plus le seul « None »).
- [ ] Scoring : un event avec `visitingTeamId` gagne bien +800 vs un past event de même équipe (`predictiveAnalytics.js`).
- [ ] Plus aucun 500 `/teams` en console.

---

## 7. Fichiers frontend de référence
- `src/utils/eventApi.js` — `getTeams`/`createTeam` (legacy make-server à remplacer).
- `src/components/EventDetailsEditor.vue` — champs Home/Visiting Team (L137-167), `teamOptions`, `isSportType`, `onVisitingTeamChange`.
- `src/components/EventsView.vue` — `getFilteredTeams`, dialog Add Team, gating `hasHomeTeam`.
- `src/components/EventPredictView.vue` — `buildEventPatchPayload` (champs team envoyés), `ensureReferentialsFromEvents` (dérivation teams depuis events).
- `src/utils/predictiveAnalytics.js` — `WEIGHTS.visitingTeam = 800` (impact scoring).
