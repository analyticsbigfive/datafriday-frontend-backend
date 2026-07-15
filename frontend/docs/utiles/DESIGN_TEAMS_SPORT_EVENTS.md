# Design — Lier des équipes (teams) aux events sport

> ## 🟢 En clair (à lire en premier)
>
> **De quoi ça parle** : permettre d'associer une **équipe visiteuse** (et une équipe à domicile) à un match, de bout en bout — de l'écran jusqu'à l'algo de prédiction.
>
> **Pourquoi maintenant** : aujourd'hui la chaîne est cassée (l'ancien service d'équipes est mort, la table `Team` n'a jamais été créée dans la base actuelle, et l'`Event` n'a pas de colonne équipe). Résultat : menu déroulant équipe vide.
>
> **Pourquoi ça compte** : l'algo pondère fort la similarité d'équipe (**+800** si même adversaire) → assigner des équipes améliore directement la qualité des prédictions sport. Plus l'historique se remplit d'équipes, plus le bonus devient utile.
>
> **Idée directrice** : une équipe appartient à une **compétition** (les clubs de Ligue 1 ≠ ceux de Handball) ; l'équipe visiteuse est un **lien** (FK) sur l'event, l'équipe à domicile reste un **texte libre**. Source des équipes recommandée : **Weezevent** (le champ existe déjà), avec migration DataFridayFM **à confirmer**, et saisie manuelle en filet.
>
> **À retenir** : le backend seul ne suffit pas — il faut aussi rebrancher le frontend sur le nouveau `/teams` (Étape F1). Ce document décrit le modèle, le parcours, l'intégration à l'algo et le plan de déploiement.

**But** : permettre d'assigner une **équipe visiteuse** (et une home team) à un event sport, de façon cohérente bout-en-bout (UI → API → DB → algo de prédiction), là où aujourd'hui la chaîne est cassée (make-server morte, table `Team` inexistante).

Doc compagnon : [BACKEND_TEAMS_EVENTS.md](./BACKEND_TEAMS_EVENTS.md) (spec technique précise). Ce document donne la **conception** et le **plan de déploiement**.

---

## 1. Pourquoi c'est cassé aujourd'hui

- Le catalogue d'équipes venait de `GET /teams` sur la **make-server Edge Function** (projet Supabase **uvxx**, aujourd'hui mort → 500/522).
- La table `Team` n'a jamais été portée dans le projet vivant **alsgd** (NestJS/Prisma).
- L'`Event` (Prisma) n'a pas de colonnes team → même en sélectionnant une équipe, rien n'est persisté.
- Résultat : dropdown « Visiting Team » vide (seulement « None ») dans EventPredict **et** `/events`.

Le frontend **s'auto-répare partiellement** : `ensureReferentialsFromEvents` reconstruit la liste d'équipes à partir des `visitingTeam` déjà présents sur des events. Mais comme rien n'est persisté et qu'aucun catalogue n'existe, la liste reste vide en pratique → **impossible d'assigner un nouvel adversaire**.

---

## 2. Modèle de données cible

### 2.1 Une équipe appartient à une compétition
Le filtrage frontend est `getFilteredTeams(eventCategoryId, eventSubcategoryId)` : les équipes de **Ligue 1** (sous-catégorie) ne doivent pas apparaître pour un match de **Handball**. Donc `Team` porte un scope :

```
Team { id, name, tenantId, eventCategoryId?, eventSubcategoryId? }
```

- `eventSubcategoryId` = la compétition précise (Ligue 1, Pro A…) → cas principal.
- `eventCategoryId` = repli plus large (Football, Basketball).
- Les deux `NULL` = équipe générique (affichée partout).

### 2.2 L'event référence l'équipe visiteuse
```
Event { …, homeTeamName: String?, visitingTeamId: String? → Team, visitingTeamName: String? }
```
- **Home team = texte libre** : c'est l'équipe « à domicile » (souvent l'équipe résidente du lieu), saisie à la main → conforme à l'UI actuelle. Pas besoin de FK.
- **Visiting team = FK** : sélectionnée dans le catalogue scopé → alimente le scoring.
- `visitingTeamName` dénormalisé = confort d'affichage / repli si la team est supprimée.

### 2.3 Le flag existant `EventCategory.hasHomeTeam`
Déjà présent en base. Sémantique : « cette catégorie d'event implique des équipes ». Sert à **gater l'UI** (n'afficher les champs team que pour Sport/hasHomeTeam) et à savoir si le scoring team est pertinent.

---

## 2bis. Sources des données équipes (provenance)

**Confirmation importante (vérifiée en code)** : mettre à jour le backend seul **NE suffit PAS** à faire apparaître les équipes dans les dropdowns. Les deux écrans lisent aujourd'hui `eventApi.getTeams()`/`createTeam()` = make-server **morte** :
- `src/components/EventsView.vue` : `this.teams ← eventApi.getTeams()` (L1248), `createTeam` (L1441), `getFilteredTeams` filtre `this.teams`.
- `src/components/EventPredictView.vue` : `teamOptions ← this.teams ← getTeams` (droppé) + `ensureReferentialsFromEvents`.

→ **Étape F1 (rebranchement frontend sur NestJS `/teams`) est OBLIGATOIRE**, pas optionnelle, pour que les dropdowns se remplissent. Backend + F1 ensemble = équipes visibles dans EventPredict **et** `/events`.

D'où doivent venir les équipes (par ordre de préférence) :

1. **Weezevent (recommandé, faisable — vérifié).** Le champ team existe déjà côté enrichissement : `updateWeezeventEventMetadata(spaceId, eventId, { team?, visitingTeam?, … })` (`src/api/endpoints/space.api.js` L162-175, `PATCH /spaces/:id/weezevent-events/:eventId`). Donc un `WeezeventEvent` peut déjà porter `team`/`visitingTeam`. Piste : dériver/synchroniser le catalogue `Team` depuis ces métadonnées Weezevent (nom d'équipe → upsert `Team` scopée à la compétition de l'event), lors du sync Weezevent ou à la volée.
2. **Migration depuis la base DataFridayFM (à CONFIRMER).** « DataFridayFM » n'est **référencé nulle part dans ce dépôt** — c'est un système externe. Faisabilité non vérifiable ici : **à valider avec l'équipe DataFridayFM** (existe-t-il une table équipes ? mapping compétition ? clé de jointure avec les events ?). Si oui → script de migration one-shot `DataFridayFM.teams → alsgd.Team` (+ mapping `eventSubcategoryId`). Ne PAS documenter comme acquis tant que le schéma source n'est pas confirmé.
3. **Seed manuel / saisie.** Repli : seed des compétitions courantes (ex. 18 clubs Ligue 1) + création via le dialog « Add New Team ». Toujours disponible même sans 1/2.

> Recommandation : viser **Weezevent en source primaire** (déjà branché, multi-tenant, cohérent avec le reste des données), **DataFridayFM en migration one-shot d'amorçage si le schéma le permet**, seed manuel en filet.

## 3. Gating UI (quand montrer les champs team)

Aujourd'hui incohérent : `EventDetailsEditor` (EventPredict) affiche Home/Visiting « toujours visibles » (commentaire L137), alors que `/events` gate « Sports with home team only ». **Cible unifiée** :

- Afficher les champs team **si** `isSportType` (eventType === 'sport') **OU** `EventCategory.hasHomeTeam === true`.
- Sinon masquer (concert/tradeshow → pas d'équipe).

Cela évite le bruit sur les events non-sport et concentre le catalogue d'équipes sur les compétitions.

---

## 4. Parcours utilisateur cible

1. L'utilisateur crée/édite un event **Sport → Football → Ligue 1**.
2. Les champs « Home Team Name » (texte) + « Visiting Team » (select) apparaissent.
3. Le select liste les équipes de **Ligue 1** (`getFilteredTeams`) + option **« + Add New Team »**.
4. « Add New Team » → `POST /teams { name, eventSubcategoryId }` → team créée et re-listée, scopée à la compétition.
5. Sélection → `visitingTeamId` posé sur l'event → `PATCH /events/:id` persiste.
6. À la prédiction, le scoring compare `event.visitingTeamId` aux past events → **+800** si même adversaire.

---

## 5. Intégration algo de prédiction

- `src/utils/predictiveAnalytics.js` : `WEIGHTS.visitingTeam = 800` (2e poids le plus fort, à égalité avec la sous-catégorie).
- Le score ajoute 800 quand `target.visitingTeamId === past.visitingTeamId` (match exact ; pas de fallback flou).
- **Condition d'efficacité** : il faut que les **past events** portent aussi `visitingTeamId`. D'où l'importance de persister le champ dès maintenant — plus l'historique se remplit, plus le bonus devient discriminant.
- Pas de changement algo requis : le code sait déjà scorer la team ; il lui manque seulement la **donnée** (colonne + catalogue).

---

## 6. Plan de déploiement (par étapes, réversible)

**Étape B1 — Backend (repo `api-datafriday`)**
- Migration Prisma : table `Team` + colonnes team sur `Event` (voir spec §3).
- `prisma migrate deploy` sur Render (vérifier que la migration passe réellement en prod).
- Contrôleur `TeamsController` (GET filtré / POST / PATCH / DELETE, scope tenant).
- DTO `PATCH /events/:id` : whitelister `homeTeamName`, `visitingTeamId`, `visitingTeamName`.

**Étape B2 — Seed (optionnel mais recommandé)**
- Seeder les équipes des compétitions utilisées (ex. 18 clubs Ligue 1 sous la bonne `eventSubcategoryId`), pour que le dropdown soit utile immédiatement sans ressaisie.

**Étape F1 — Frontend**
- `src/api/endpoints/team.api.js` (NestJS/axios).
- Rebrancher `EventPredictView` (loadAll) + `EventsView` (getFilteredTeams, Add Team) sur ce wrapper.
- Supprimer les `/teams` make-server de `src/utils/eventApi.js`.
- Unifier le gating UI (§3).

**Étape V — Vérif**
- Dropdown peuplé, création d'équipe OK, persistance `visitingTeamId` (relire l'event), plus de 500 `/teams`, bonus 800 observable sur un cas test.

---

## 7. Évolutions possibles (hors périmètre initial)

- **Home team en FK** (`homeTeamId`) + scoring home team → symétrie avec visiting. Aujourd'hui home = texte, non scoré.
- **Import automatique des équipes** depuis Weezevent / un référentiel sportif externe.
- **Logos / métadonnées équipe** (couleurs, ville) pour l'affichage.
- **Poids configurable** par tenant (certains sports pondèrent l'adversaire différemment).

---

## 8. Risques / points d'attention

- **Migrations non jouées en prod** : antécédent connu (500 « table absente ») → toujours vérifier `migrate deploy` sur Render.
- **Multi-tenant** : `Team` DOIT être scopée `tenantId` (ne jamais lister les équipes d'un autre tenant).
- **Rétro-compat** : colonnes nullable, aucun event existant cassé ; le catalogue vide dégrade proprement (dropdown « None ») en attendant le seed.
- **Cohérence des deux éditeurs** : `EventDetailsEditor` (EventPredict) et l'éditeur inline de `/events` doivent lire/écrire les mêmes champs (`visitingTeamId`, `homeTeamName`) et le même endpoint `/teams`.
