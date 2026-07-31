# RH / Staffing — bibliothèques Suppliers & Positions (étape 1 : branchement UI)

> Domaine cartographie : **RH** (nouveau). Owner produit : Jean-Luc. Rédaction : **JLH**, 2026-07-21.
> Écran : `/hr` (?tab=suppliers|positions). Branche `feat/postEventInventory`.
>
> Établi le 2026-07-21, chaque affirmation vérifiée en ouvrant le fichier cité (`fichier:ligne`),
> conformément à la méthode du dossier ([00_INDEX.md](00_INDEX.md)). Cette page documente
> **l'étape 1** (câblage des écrans prototype existants dans la navigation Settings, UI seule)
> et conserve en § 6 la **cible fonctionnelle complète** (spec `RH.pptx` + règles `Règles RH.xlsx`)
> comme référence pour les étapes suivantes — **l'algorithme de staffing est explicitement
> reporté** (jugé bugué par le métier, à revalider avec Bertrand avant toute implémentation,
> question [#28](../QUESTIONS_A_BERTRAND.md)).

---

## 1. Vue d'ensemble

| | |
|---|---|
| Route | `/hr`, name `hr`, `keepAlive: true`, `?tab=suppliers\|positions` ([router/index.js](../../src/router/index.js), bloc après `/event-subcategories`) |
| Permission | `menu.hr.manage` (route meta ; déjà au catalogue backend [permission-catalog.ts:93](../../../backend/src/core/rbac/permission-catalog.ts) — « catalogue seul, pas encore d'endpoint dédié ») |
| Écran routé | [`components/hr/views/HrView.vue`](../../src/components/hr/views/HrView.vue) — `<v-app>` local + [`WorkspaceAppHeader`](../../src/components/WorkspaceAppHeader.vue) (cloche/réglages/avatar, parité Analyse/EventPredict) + `v-tabs` **HR Suppliers** / **Staff Positions** ; drawer Dashboard en rail (route dans `isRailPushRouteName` ET `isSelfHeadedRouteName`, [DashboardView.vue:539-548](../../src/views/DashboardView.vue)) |
| Onglets (5ᵉ passe) | **Réécrits en Vuetify + i18n** : [`components/hr/HrSuppliersTab.vue`](../../src/components/hr/HrSuppliersTab.vue) (table, dialog v-select Spaces/Sectors, CSV export/import), [`components/hr/HrPositionsTab.vue`](../../src/components/hr/HrPositionsTab.vue) (Agence → Secteur → Poste (combobox mémorisé) → Taux), utilitaires [`components/hr/hrShared.js`](../../src/components/hr/hrShared.js) (`HR_SECTORS`, CSV) |
| Écrans legacy (morts) | [`ConsolidatedHRView.vue`](../../src/components/ConsolidatedHRView.vue), [`HRSuppliersView.vue`](../../src/components/HRSuppliersView.vue), [`StaffPositionsView.vue`](../../src/components/StaffPositionsView.vue) — prototype shadcn, remplacés par les onglets ci-dessus (dialogs cassés dans le layout Vuetify, cf. 5ᵉ passe) |
| Données | **`src/utils/hrApi.js` = 100 % localStorage** (clés `hr_suppliers`, `staff_positions`, `position_names`) — aucune API, aucune table |
| Entrées de nav | **Drawer Settings réel** (Dashboard, gear du header) : groupe « Edit HR » → HR Suppliers / Staff Positions, déclaré dans [`constants/navigation.js`](../../src/constants/navigation.js) `SETTINGS_NAVIGATION` (gating `can('menu.hr.manage')`, ADMIN passe toujours) ; surface legacy : SettingsMenu de la page overview ([SettingsMenu.vue:137-143, 465-484](../../src/components/SettingsMenu.vue)) ; burger MainNav → « HR » ([MainNav.vue:42](../../src/components/MainNav.vue)) |

## 2. Ce que l'étape 1 a réellement changé (2026-07-21)

Avant : toute la chaîne UI existait (entrée Settings, sous-menu, écrans, gating MainNav) mais
aboutissait sur un **`noop`** — vues « jamais routées » en quarantaine cartographie §4.
Trois changements, zéro modification des écrans eux-mêmes :

1. **Route `/hr`** ajoutée dans [router/index.js](../../src/router/index.js) (lazy import, pattern
   `/events` : `meta { title: 'Edit HR', keepAlive: true, permission: 'menu.hr.manage' }`).
2. **Wrapper [`HrView.vue`](../../src/components/hr/views/HrView.vue)** : onglet piloté par
   l'URL (`?tab=`), `onClose` → `/spaces-overview`, `onOpenHR` interne → `router.replace` du
   query. `onOpenEvents` **volontairement non passé** : `ConsolidatedHRView.handleOpenEventsFromSettings`
   enchaîne `onOpenEvents()` puis `onClose()` ([ConsolidatedHRView.vue:234-239](../../src/components/ConsolidatedHRView.vue)),
   le second push écraserait la navigation ; sans la prop, MainNav masque l'entrée Events (v-if).
3. **[`SpacesOverviewView.vue`](../../src/views/SpacesOverviewView.vue)** : `:on-open-hr="noop"`
   remplacé par un vrai handler → `router.push({ path: '/hr', query: { tab } })`.

### Mise à jour 2026-07-21 (2ᵉ passe) — la vraie surface Settings est le drawer Dashboard

**Piège des deux surfaces Settings.** `SettingsMenu.vue` (câblé ci-dessus) n'est la surface que de
la page overview legacy (`SpacesPage`). Le panneau Settings que voit réellement l'utilisateur est
le **drawer Vuetify de `DashboardView`** ([DashboardView.vue:53-183](../../src/views/DashboardView.vue)),
ouvert par le gear des headers (`WorkspaceAppHeader` → event `datafriday:open-settings`) et
alimenté par la structure déclarative **`SETTINGS_NAVIGATION`**
([constants/navigation.js](../../src/constants/navigation.js)) — qui n'avait aucune entrée RH.
Compléments apportés :

4. **`constants/navigation.js`** : groupe `settings-hr` (icône `UserCog`, déjà mappée dans
   `SETTINGS_ICONS`) avec 2 items → `/hr?tab=suppliers` / `/hr?tab=positions`, permission
   `menu.hr.manage` par item (filtrage `visibleSettingsNavigation`, DashboardView.vue:484-494 ;
   `can()` = `!code || ADMIN || userPermissions.includes(code)`, seul ADMIN l'a par défaut —
   [permission-catalog.ts:122-130](../../../backend/src/core/rbac/permission-catalog.ts)).
5. **i18n** : clés `navEditHR`, `navHrSuppliers`, `navHrPositions` (EN + FR) dans
   [`translations.js`](../../src/i18n/translations.js) — le drawer passe tout par `t()`.
6. **`DashboardView.vue`** : `'hr'` ajouté à `isSelfHeadedRouteName` (:539-544) —
   ConsolidatedHRView rend son propre header (X, burger, avatar), sans quoi la barre Dashboard
   s'empilait au-dessus (même traitement que `space-restock`).

### Mise à jour 2026-07-21 (5ᵉ passe) — onglets réécrits en Vuetify (fin du prototype shadcn)

Les dialogs shadcn (`src/ui/dialog*`) rendaient un popup disloqué dans le layout Vuetify imbriqué
(labels tronqués, dialog décalé sous le rail, checkboxes invisibles — capture utilisateur).
Plutôt que de re-rafistoler : **`HrSuppliersTab.vue` / `HrPositionsTab.vue`** (nouveaux, Vuetify
natif — `v-table`, `v-dialog`, `v-select` multiple à chips, `v-combobox` pour les noms de poste,
`v-snackbar`), 100 % i18n (clés `hr…`), même couche de données `hrApi.js` (localStorage,
shapes préservés : suppliers `{id,name,email,phone,contactName,spaceIds[],sectors[]}`, positions
`{id,supplierId,sector,positionName,ratePerHour}`, noms `{id,name,sector}`). CSV : export
identique ; **import simplifié en auto-mapping par en-têtes** (plus de dialog de mapping colonne
par colonne). `hrShared.js` porte `HR_SECTORS` + parseur/export CSV. Les trois vues prototype
(`ConsolidatedHRView`, `HRSuppliersView`, `StaffPositionsView`) redeviennent mortes — plus aucun
composant `src/ui/*` dans le parcours RH, tension §4 ligne 1 soldée pour ce module.

### Mise à jour 2026-07-21 (4ᵉ passe) — chrome unifié avec Analyse/EventPredict

Demande utilisateur : même header/sidebar que les sections Analyse et EventPredict.
`HrView.vue` réécrit sur le pattern de [`SpaceInventoryView`](../../src/views/SpaceInventoryView.vue) :
`<v-app>` local + `WorkspaceAppHeader` (`section = t('navEditHR')`, sans space-switcher,
bouton home) + `v-tabs` (couleur charte `#ff3131`) pilotés par `?tab=` (router.replace).
`'hr'` ajouté à `isRailPushRouteName` → le drawer Dashboard (MAIN_NAVIGATION) s'affiche en rail
et pousse la page, comme Inventaire/Analyse. Conséquences :

- **`ConsolidatedHRView` redevient un composant mort** (son header X/burger et sa sidebar sont
  remplacés) — retour case quarantaine (cartographie §4 mise à jour). Le contournement BUG-230
  reste documenté mais ne concerne plus `/hr`.
- Racines des sous-vues passées de `h-screen` à `h-full` (hauteur fixée par HrView sous
  l'app-bar 64 px ; `h-screen` débordait). Leur bandeau titre interne (`v-if="onClose"`) reste
  masqué (prop non passée).
- **`/spaces-overview` (SpacesPage) : audité, cul-de-sac** — aucune entrée de navigation ne
  pointe dessus (seuls : la déf. de route, un libellé de loader, une map de titre AppHeader).
  Style prototype (capture « HOME / ANALYSE »). Candidat quarantaine/suppression — décision à
  acter (le câblage SettingsMenu de la 1ʳᵉ passe ne vit que sur cette page).

### Mise à jour 2026-07-21 (3ᵉ passe) — crashs prototype corrigés après repro navigateur

Deux crashs reproduits par l'utilisateur (dialog Add Supplier : `undefined.length` ; Export CSV :
`toast is not defined`) + backend fantôme découvert au diagnostic. Détail complet, corrections et
restes ouverts : **[BUG-231](../bugs/231_ecrans_rh_routes_restes_prototype.md)**. En bref :
`SECTORS` exposé via `data()` (const de module invisible aux templates), shim `toast` console,
`CSVMappingDialog` réactivé, bascule `utils/api.js` (Edge Function KV morte) →
`space.api.js` (`getSpacesLight`), N+1 configs parallélisé.

### Piège Vue vérifié — liaison de la prop `onOpenHR`

La prop a **deux majuscules consécutives** (`HR`). La forme kebab `:on-open-hr` camelise en
`onOpenHr` ≠ `onOpenHR` → **liaison silencieusement morte** (c'était le cas du `noop` historique).
Toujours lier en camelCase : `:onOpenHR="…"` — comme le font déjà
[SpacesPage.vue:99,113](../../src/components/SpacesPage.vue) et
[ConsolidatedAccountView.vue:47](../../src/components/ConsolidatedAccountView.vue).

## 3. Verdict base de données (vérifié 2026-07-21)

**Aucune table RH dans [`backend/prisma/schema.prisma`](../../../backend/prisma/schema.prisma)** :
pas de `HrSupplier`, pas de `StaffPosition`. Ne pas confondre avec :

- **`ElementStaff`** (schema.prisma:706-722) — staffing statique par élément×config du **builder**
  (`position`, `count`, `hourlyRate`, servi par builder-v2 `staffByConfig`) : autre concept, non touché.
- **`Supplier`** (schema.prisma:774-798) + module `features/suppliers/` — fournisseurs
  **ingrédients** (Market Price), pas les agences de staffing.

Conséquence : les données RH sont **par navigateur, non partagées, non sauvegardées** côté
serveur. Limite assumée pour l'étape 1 (décision utilisateur 2026-07-21), migration = étape 2
(question [#29](../QUESTIONS_A_BERTRAND.md)).

## 4. Dettes/tensions assumées (ne pas « corriger » sans décision)

| Tension | Détail | Statut |
|---|---|---|
| ~~`src/ui/*` (zone morte CLAUDE.md)~~ | Soldé (5ᵉ passe) : les onglets `components/hr/` sont Vuetify natif, plus aucun composant `src/ui` dans le parcours RH | Vues prototype retournées en quarantaine (cartographie §4) |
| ~~`utils/api.js` (monolithe 45 Ko)~~ | Résolu (3ᵉ passe) : son `baseUrl` pointait l'Edge Function KV morte → liste Spaces vide. `HRSuppliersView` consomme désormais [`space.api.js`](../../src/api/endpoints/space.api.js) (`getSpacesLight` + `getSpaceConfigurations`) | Plus aucun consommateur RH du monolithe (Restock reste le seul) |
| ~~Textes EN codés en dur~~ | Soldé (5ᵉ passe) : onglets `components/hr/` 100 % i18n (clés `hr…`, EN + FR) | — |
| Entrée Settings non gatée | « Edit HR » du SettingsMenu s'affiche sans test `can()` (comme les autres entrées) ; l'accès réel est bloqué par le guard de route | Comportement existant conservé |

## 5. Vérification manuelle (parcours)

1. Gear du header (n'importe quelle page sous Dashboard) → drawer Settings → groupe « Edit HR »
   → « HR Suppliers » ⇒ `/hr?tab=suppliers` ; « Staff Positions » ⇒ `/hr?tab=positions`.
   Variante legacy : page overview → SettingsMenu → Edit HR → Suppliers/Positions (même cible).
2. Add Supplier : liste Spaces = espaces réels ; save → ligne en table ; reload → persiste (localStorage).
3. Add Position : dropdown Supplier alimenté par les suppliers créés.
4. X (header) → retour `/spaces-overview`. Burger MainNav : entrée HR visible avec `menu.hr.manage`.
5. Sans `menu.hr.manage` : route `/hr` bloquée par le guard ([guards.js:134](../../src/router/guards.js)).

## 6. Cible fonctionnelle (référence pour les étapes suivantes — NON implémentée)

Sources : `RH.pptx` (spec UI, 4 slides) + `Règles RH.xlsx` (règles de calcul), analysées le 2026-07-21.

### 6.1 Spec UI (pptx)

1. Onglet **« Staff »** dans EventPredict *Configuration settings* (3ᵉ onglet à côté de
   `configuration`/`stockup`, [EventPredictView.vue:738-753](../../src/components/EventPredictView.vue)) —
   contenu de référence pour cet onglet : **la Google Slide interface** (réponse Bertrand
   2026-07-24, [Question #22](../QUESTIONS_A_BERTRAND.md)). Reste **planifié séparément** de
   `feat/postEventInventory`, non implémenté — l'algo de calcul reste à revalider avant
   implémentation (question **#28**, toujours ouverte).
2. Par PDV : nom, Peak Transaction/Min, coût staff prédit vs ajusté, bouton « + staff »,
   slider horaires d'ouverture.
3. Une ligne par staff suggéré (pattern lignes Menu Items) : checkbox désactivation, rôle,
   fournisseur (logique **CDI dispo en BDD > CDD dispo > agence par défaut du rôle**), nom
   (dropdown employés si interne, sinon champ libre = nom d'agence), taux horaire HT, slider
   début/fin, total HT.
4. Settings RH — formulaire de Rôle : Department (F&B, Merchandising, Hospitality,
   Entertainment) ; si F&B → Contract type (CDD, Freelance, CDI, Agency, Other) ; si Agency →
   multi-select Supplier ; si CDD/Agency/Freelance → radio taux horaire/journalier/mensuel ; devise.

### 6.2 Règles de calcul (xlsx — **à revalider avec Bertrand, #28**)

Paramètres : Goal/TPE = 2 000 € (CA cible par terminal), staff par Responsable de zone = 15,
TPE par mètre linéaire = 0,7. Taux indicatifs : RZ 35 €/h, Resp. PDV 30, Caissier/Runner/Barman/EPR 25,
Chef de parti 28, Commis 20.

Par PDV (CA = CA prédit du shop, catégorie = type de PDV Beverage/Kitchen food/Front Food/Mixology…) :

- Responsable PDV = 1 si catégorie food et (ouverture obligatoire ou CA ≥ Goal/2)
- Caissiers = 0 si CA < Goal/2 (sauf obligatoire) sinon ROUNDUP((CA − Goal/3)/Goal), plafonné
  par max TPE = ROUNDUP(linéaire/0,7), min 1 si obligatoire
- Runners = ROUNDDOWN((CA + Goal/2)/Goal) − Responsable PDV
- Barman = 1 si Mixology ; Chef de parti + Commis si Kitchen food (raffinements friteuses/burgers) ;
  EPR si Front Food (dinettes/hot-dogs)
- Responsable de zone = ROUNDUP(staff front total/15) — niveau espace
- Alertes productivité front : > 2 500 €/pers = sous-effectif, < 1 000 = sureffectif
- Horaires suggérés : ouverture PDV − 1 h → fermeture + 1 h ; coût prédit = Σ staff × taux × heures

Prérequis données identifiés (absents du schéma actuel) : catégorie RH par shop (l'enum
`ShopType` food/beverages/beer/merch ne correspond pas), agences staffing, employés + contrats,
mètre linéaire par shop (candidat : `SpaceElement.width`), horaires par shop. Ancrages predict
disponibles : CA par shop via `EventPredictVersion.predictedRecords`, peak tx/min dérivable des
buckets minute par shop ([usePredictiveTimeline.js:1058-1083](../../src/composables/usePredictiveTimeline.js)),
persistance par scénario via [useEventPredictVersions.js:133,415](../../src/composables/useEventPredictVersions.js).

### 6.3 Étape 2 envisagée (backlog)

Tables `HrSupplier`/`StaffPosition` (+ SQL idempotent `backend/prisma/sql/`), module NestJS
`features/hr/` sous `menu.hr.manage`, bascule `hrApi.js` → `api/endpoints/hr.api.js` + store
Vuex TTL. Ensuite seulement : formulaire de Rôle complet, employés, algo + onglet Staff EventPredict.

## 7. Questions Bertrand liées

| # | Sujet | Statut |
|---|---|---|
| [#22](../QUESTIONS_A_BERTRAND.md) | Onglet Staff dans EventPredict Configuration Settings (contenu attendu) | 🟡 — spec de référence donnée (Google Slide interface, 2026-07-24), implémentation non traitée, bloquée sur #28 |
| [#28](../QUESTIONS_A_BERTRAND.md) | Règles xlsx « buguées » : lesquelles, et formules validées ? | 🔴 |
| [#29](../QUESTIONS_A_BERTRAND.md) | Persistance BDD des suppliers/positions (étape 2) | 🔴 |
| [#30](../QUESTIONS_A_BERTRAND.md) | Devenir d'`ElementStaff` (builder) vs bibliothèque RH | 🔴 |
| [#41](../QUESTIONS_A_BERTRAND.md) | Settings HR — règle de résolution « ensemble d'espaces → valeur affichée par carte » (ligne spécifique vs TOUS, dernière gagne ?) + sémantique du bouton Edit par carte | 🔴 |

## 8. Bugs actifs (fiches [`docs/bugs/`](../bugs/00_INDEX.md))

| Fiche | Résumé | Statut |
|---|---|---|
| [201](../bugs/229_props_double_majuscule_liaison_kebab_morte.md) | Props à double majuscule : liaison kebab-case silencieusement morte (`onOpenHR`, `onOpenFBIntegration`) — corrigé en camelCase sur la branche | 🟡 |
| [202](../bugs/230_consolidated_views_double_navigation_onclose.md) | `handleOpen*FromSettings` = handler + `onClose()` → double navigation ; contourné dans `HrView` (prop `onOpenEvents` omise) | ⚪ |
| [203](../bugs/231_ecrans_rh_routes_restes_prototype.md) | Restes de prototype (🟠) : crashs corrigés puis écrans remplacés par `components/hr/` Vuetify (5ᵉ passe) — plus rien d'ouvert sur `/hr` | 🟡 |

## 9. Settings HR — paramétrage Goals & Staff/Zone Manager (étape 2, en cours)

> Ajout **Emmanuel, 2026-07-28**. Demande Bertrand (2 maquettes « Settings RH »). Domaine RH
> (Jean-Luc) — implémenté par Emmanuel sur décision utilisateur. **Première brique concrète de
> l'étape 2 backend** annoncée en §6.3 : contrairement aux Suppliers/Positions (localStorage),
> cette feature persiste en **vraie BDD** (choix utilisateur 2026-07-28).

### 9.1 Objectif (maquettes Bertrand)

Sous le menu **« Edit HR »**, un sous-menu **« Settings HR »** ouvre une vue façon « My Spaces »
(sans le bandeau KPI revenue), où chaque carte d'espace montre 4 métriques RH et une icône **Edit**.
Deux variables se paramètrent, chacune **rattachée à un ensemble d'espaces** (une ligne par
ensemble, « TOUS » = tous les espaces) :

1. **Default Goal per TPE** — objectif de CA par TPE (champ **devise**, ex. 2000 €).
2. **Number of staff per Zone Manager** — nombre de staff par Responsable de zone (**entier**, ex. 15).

Les 2 autres métriques des cartes (**Staff Cost Total**, **Staff Cost Avg/Event**) sont des
**valeurs calculées, différées** (décision 2026-07-28) — pas saisies ici, affichées plus tard.

### 9.2 Backend (livré 2026-07-28, migration à appliquer)

Modèle de données ([schema.prisma](../../../backend/prisma/schema.prisma), après `model Space`) —
table de jointure explicite (jamais de `spaceIds` JSON, colonne gelée ADR-0003), `tenantId`
scalaire requis → **auto-scopé par PrismaService** ; « TOUS » porté par `allSpaces=true`
(jointure vide), pas par une sentinelle string :

| Modèle | Champs clés |
|---|---|
| `HrGoal` | `goalPerTpe Float`, `allSpaces Boolean`, `spaces HrGoalSpace[]`, `tenantId`, timestamps |
| `HrGoalSpace` | `@@id([goalId, spaceId])` (jointure Goal↔Space, `onDelete: Cascade`) |
| `HrStaffRatio` | `staffPerZoneManager Int`, `allSpaces Boolean`, `spaces HrStaffRatioSpace[]`, `tenantId`, timestamps |
| `HrStaffRatioSpace` | `@@id([ratioId, spaceId])` (jointure Ratio↔Space, `onDelete: Cascade`) |

Module NestJS [`backend/src/features/hr-settings/`](../../../backend/src/features/hr-settings/)
(cloné sur `features/brands/`) — `HrSettingsService` + 2 controllers, **tout gardé par
`@RequirePermissions('menu.hr.manage')`** (permission déjà au catalogue, cf. §1) :

| Route | Verbe(s) |
|---|---|
| `/hr-settings/goals` | GET (liste), POST, PATCH/:id, DELETE/:id |
| `/hr-settings/staff-ratios` | GET (liste), POST, PATCH/:id, DELETE/:id |

DTO validés `class-validator` (`goalPerTpe @IsNumber @Min(0)`, `staffPerZoneManager @IsInt @Min(0)`,
`allSpaces?`, `spaceIds?`) ; validation service : si `allSpaces=false`, `spaceIds` requis non vide et
tous dans le tenant. Réponse liste `{ data: [{ id, goalPerTpe|staffPerZoneManager, allSpaces,
spaceIds[], createdAt, updatedAt }] }`. Enregistré dans
[`app.module.ts`](../../../backend/src/app.module.ts).

**Migration Prisma — à lancer manuellement** ([ADR-0002 **backend**](../../../backend/docs/adr/0002_migrations_manuelles_jamais_plateforme.md),
dossier `prisma/migrations` gitignoré) :
`pnpm prisma:migrate` (dev, avec `DIRECT_URL` port 5432) puis `prisma migrate deploy` sur chaque env.
Aucune commande lancée par l'agent. Après migration : `pnpm docs:api` régénère la doc API.

### 9.3 Frontend (à faire — étape suivante)

- **Menu** : +1 item dans le groupe `settings-hr` de [navigation.js](../../src/constants/navigation.js) :
  `{ title:'navHrSettings', route:'/hr/settings', permission:'menu.hr.manage' }` + i18n `navHrSettings`.
- **Route** `/hr/settings` (name `hr-settings`) → `HrSettingsView.vue` (pattern `HrView`, grille de
  cartes sans bandeau revenue).
- **Carte** `HrSpaceCard.vue` (dérivée de [SpaceItem.vue](../../src/components/spaces/widgets/SpaceItem.vue)) :
  4 métriques RH + icône Edit → drawer d'édition par espace.
- **2 boutons Add** (tooltip) → **2 drawers** (pattern [HrSupplierFormDrawer.vue](../../src/components/hr/HrSupplierFormDrawer.vue),
  CSS `hrForms.css`) : « Ajouter un Goal » (devise + espaces + TOUS) / « Ajouter un Nombre de staff ».
- **Couche données** : `api/endpoints/hrSettings.api.js` + store Vuex TTL (pattern standard) — pas de
  localStorage (contrairement à l'étape 1 Suppliers/Positions).

### 9.4 Règle de résolution espace → valeur (⚠️ hypothèse, à valider #35)

Une carte affiche **une** valeur par espace, mais les lignes ciblent des **ensembles**. Règle par
défaut retenue (documentée, **non tranchée par Bertrand**) : **une ligne spécifique (espace listé)
prime sur une ligne `TOUS`** ; en cas de conflit entre deux lignes spécifiques, **la plus récente
gagne**. Le bouton **Edit** par carte crée/mets à jour la **ligne mono-espace** de cet espace
(POST si absente, PATCH sinon) plutôt que d'empiler des doublons. Sémantique à confirmer —
question [#41](../QUESTIONS_A_BERTRAND.md).

---

## 10. Étape 2 — implémentation complète du staffing (2026-07-29, branche `feat/Hr`)

> Rédaction : **JLH**, 2026-07-29. Algo **validé** le 2026-07-29 par énumération des paliers
> (question [#28](../QUESTIONS_A_BERTRAND.md) résolue — l'ancienne formule caissiers/runners du
> xlsx est abandonnée). Simulation interactive de référence : artifact « Module RH — Plan &
> Simulation » (tests des paliers auto-exécutés dans la page).

### 10.1 Règle de staffing validée (remplace §6.2)

```
n = FLOOR(caPredictif / goalTpe)      invariant : rpdv + caissiers + runners = n (n ≥ 1)

ouvre  = ouvertureObligatoire OU n ≥ 1 (CA ≥ goal) ; sinon FERMÉ (tout = 0)
total  = MAX(n, 1)                    (ouverture obligatoire et n ≤ 1 → 1 personne)

sans RPDV : caissiers = CEIL(total/2) ; runners = FLOOR(total/2)      → 0/1/0 · 0/1/1 · 0/2/1 · 0/2/2 · 0/3/2 …
avec RPDV : total≤1 → 1/0/0 · =2 → 1/1/0 · =3 → 1/1/1 · ≥4 → 1/2/(total−3)   → 1/2/1 · 1/2/2 · 1/2/3 …
            (caissiers plafonnés à 2 — littéral validé JLH ; asymétrie avec le cas sans RPDV assumée)
clamp TPE : caissiers ≤ maxTpe = CEIL(mètres/0.7), excédent basculé en runners (invariant préservé)
beverage  : runners = MAX(runners, nbTireuses)                         (Q3 défaut)
barman = hasMixology ; frontFood : chef=1, commis = friteuses + CEIL(burgers/200)·2, epr = dinettes + FLOOR(hotdogs/200)
rz = CEIL(Σ front / staffPerZoneManager)  — front = rpdv+caissiers+runners+barman
coûts §5 : prédit = figé à la génération (ElementPerformance.staffCost) ; ajusté = Σ lignes enabled
```

### 10.2 Livré (6 commits atomiques)

| Commit | Contenu |
|---|---|
| `94cf2db` | Prisma : `HrSupplier`, `HrRole`, `HrRoleSupplier`, `HrPerson`, `HrRoleSpaceDefault`, `EventStaffLine` + SQL manuel [`2026-07-29_hr_staffing_module.sql`](../../../backend/prisma/sql/2026-07-29_hr_staffing_module.sql) ([ADR-0002 backend](../../../backend/docs/adr/0002_migrations_manuelles_jamais_plateforme.md), **à appliquer manuellement**) |
| `28ad6b2` | Features NestJS [`hr/`](../../../backend/src/features/hr/) (CRUD suppliers/roles/persons, validation conditionnelle, import one-shot) + [`staffing/`](../../../backend/src/features/staffing/) (calculateur **pur** + orchestration + `GET /hr-settings/costs`) + **29 tests jest** (paliers, invariant, clamp, 212,50 €) |
| `b84668f` | [`utils/hrApi.js`](../../src/utils/hrApi.js) → API (signatures conservées), import one-shot localStorage puis purge |
| `cb69c4a` | `HrPositionFormDrawer` → [`HrRoleFormDrawer`](../../src/components/hr/drawers/HrRoleFormDrawer.vue) (champs conditionnels §2.1 spec, algoKey auto) ; fix route `/hr` (pointait sur `HrView` inexistant) + `/hr/positions` ; coûts staff réels sur les cartes HR Settings |
| `4798956` | Onglet **Staff** d'EventPredict ([`EventPredictStaffSection.vue`](../../src/components/EventPredictStaffSection.vue), pattern `ep-shop-card`, PATCH debounce 500 ms) + store [`staffing.js`](../../src/store/modules/staffing.js) |
| (celui-ci) | Rapport final + résolution #28 |

### 10.3 Hypothèses (constantes nommées, à confirmer avec Bertrand)

| Hypothèse | Où | Défaut |
|---|---|---|
| Q1 cadence appliquée au pic | `TX_RATE_BASIS` | `'PEAK'` |
| Q2 POS supplémentaire | `EXTRA_POS_MODE` | warning, jamais de caissier auto |
| Q3 runners tireuses | `BEVERAGE_RUNNER_MODE` | `MAX` (pas addition) |
| Q4 caissier de dinette | `DINETTE_CASHIER_INCLUDED` | couvert par le calcul caissiers |
| Q5 commis inter-stands | — | **non traité** (TODO visible) |
| Q6 conversions | `DAILY_HOURS=8`, `MONTHLY_HOURS=151.67` | Daily/8 h, Monthly/151,67 h |
| Q7 « disponible » (HrPerson) | `pickAssignment` | active + distribution par index dans l'event |
| Types d'éléments PDV | `STAFFING_ELEMENT_TYPES` | `shop, fnb_food, fnb_beverages, fnb_bar, fnb_snack` |
| Inputs algo par PDV | `SpaceElement.attributes` (Json) | clés `metresLineaires`, `ouvertureObligatoire`, `hasResponsablePdv`, `txParSeconde`, `nbTireuses`, `nbFriteuses`, `nbBurgersPrevus`, `nbDinettes`, `nbHotdogsPrevus` ; capacités via `type` + `subtypes` ; mètres inconnus → pas de plafond TPE |
| Fin d'event absente | `DEFAULT_EVENT_DURATION_HOURS` | portes + 6 h ; offsets lignes −1 h/+1 h |
| Résolution goal/ratio | `resolveSettings` (server-side) | ligne contenant l'espace > `TOUS`, plus récente gagne (miroir §9.4) |

### 10.4 Reste à faire (hors périmètre de la branche)

1. **Appliquer les DEUX SQL manuels** sur chaque environnement, dans l'ordre, puis `prisma generate` :
   [`2026-07-29_hr_staffing_module.sql`](../../../backend/prisma/sql/2026-07-29_hr_staffing_module.sql)
   puis [`2026-07-30_hr_settings_goals_ratios.sql`](../../../backend/prisma/sql/2026-07-30_hr_settings_goals_ratios.sql).
   Procédure : [ADR-0002 **backend**](../../../backend/docs/adr/0002_migrations_manuelles_jamais_plateforme.md)
   (⚠️ à ne pas confondre avec [ADR-0002 frontend](../adr/0002_builder_v2_relationnel_seul.md), Builder v2 —
   numérotation indépendante par repo) ; mécanisme du no-op détaillé dans [`09_TECHNIQUE.md`](09_TECHNIQUE.md) ligne 449.
2. **Alimenter le `caPredictif`** — bloquant, cf. §10.5.
3. **UI de saisie des inputs algo** dans `SpaceElement.attributes` (§10.3, dernière ligne) — bloquant, cf. §10.5.
4. Écran de gestion des `HrPerson` (le backend + dropdown « Nom » existent ; pas d'écran CRUD dédié).
5. `HrRoleSpaceDefault` (agence par défaut espace × rôle) : backend + présélection livrés, pas d'UI de saisie.
6. E2E léger spec §6 : générer → décocher → slider → vérifier pills (une fois le SQL appliqué sur staging).

### 10.5 Vérification en base (2026-07-30, Supabase `alsgdtewqeldrrquypdy`)

> Rédaction : **JLH**, 2026-07-30. Audit de contrôle du rapport étape 2 (§10.2) : chaque affirmation
> rejouée contre le code (`file:line`) et contre la base.

Audit `information_schema` + `SELECT` sur l'environnement de travail. L'algo (§10.1) est conforme
au code ligne à ligne ; les trois écarts sont des écarts de **déploiement et de données**, pas de
logique.

| Constat | Preuve | Effet |
|---|---|---|
| Aucune table `Hr*` ni `EventStaffLine` en base | `information_schema.tables` : seule `ElementStaff` matche | tous les endpoints `/hr*` et `/staffing` échouent (relation inexistante) |
| Le SQL des 4 tables Settings n'existait pas | `56297d8` = `schema.prisma +63`, zéro fichier `prisma/sql/` | corrigé : `2026-07-30_hr_settings_goals_ratios.sql` écrit le 2026-07-30 |
| **`ElementPerformance` est vide (0 ligne)** | `SELECT count(*) FROM "ElementPerformance"` → `0` | `perf?.revenue ?? 0` → `caPredictif = 0` → `n = FLOOR(0/goal) = 0` → `open = false` sur 100 % des PDV → `generate` rend **zéro ligne de staff**, même après migration + seed |
| Clés algo absentes de `SpaceElement.attributes` | `jsonb_each` sur 742 lignes : seules `originalType` (695), `importedFromWeezevent` (686), `storageShopIds` (5) | jamais de RPDV, pas de plafond TPE, `ouvertureObligatoire` jamais vrai (donc pas de repli quand le CA manque), commis/EPR = 0 |
| `ElementPerformance.staffCost` déjà en base | `information_schema.columns` : `double precision` | aucun `ALTER TABLE` nécessaire |

**Question ouverte — source du `caPredictif`.** `staffing.service.ts:226` lit
`ElementPerformance.revenue`, une métrique builder par `configId`, pas le CA prédit de l'événement
(`EventPredictVersion.predictedRecords`, `schema.prisma:2833`). Deux options : alimenter
`ElementPerformance.revenue` depuis le pipeline predict, ou agréger `predictedRecords` par élément
à la génération. Non tranché → question
[#43](../QUESTIONS_A_BERTRAND.md#questions-ouvertes).

**Réserve sur §9.4.** `resolveSettings` (`staffing.service.ts:85-106`) implémente exactement la
règle §9.4 — mais §9.4 est elle-même marquée « hypothèse à valider » (questions #35 / #41). La
conformité du code ne vaut donc pas validation métier.

## 11. Étape 3 — déploiement des tables + consolidation backlog RH/STF/CFG (2026-07-30)

> Rédaction : Claude (session Ulrich), 2026-07-30. Croisement d'un backlog externe (tickets
> STF-1/STF-2, RH-1 à RH-5, CFG-1/CFG-2) avec le code déjà écrit (§9-10) : la majorité des tickets
> étaient déjà couverts par le schéma non déployé — seul un sous-ensemble volontairement réduit a
> nécessité du nouveau code, pour éviter la dispersion.

### 11.1 Tables déployées (levée du blocage §10.5/§10.4 point 1)

Les 4 migrations suivantes ont été créées sous `backend/prisma/migrations/` et appliquées via
`npx prisma migrate deploy` sur l'environnement Supabase de `backend/.env`
(`aws-1-eu-west-1.pooler.supabase.com`), puis `npx prisma generate` :

1. `20260730160000_hr_staffing_module` — copie conforme de `2026-07-29_hr_staffing_module.sql`.
2. `20260730160100_hr_settings_goals_ratios` — copie conforme de `2026-07-30_hr_settings_goals_ratios.sql`.
3. `20260730160200_hr_supplier_rename_sectors_departments` — RH-5 (§11.4).
4. `20260730160300_hr_sinking_rule` — nouvelle table `HrSinkingRule` (§11.3).

Vérifié après coup (audit isolé, tenant fictif nettoyé) : les 11 tables existent
(`HrSupplier`, `HrRole`, `HrRoleSupplier`, `HrPerson`, `HrRoleSpaceDefault`, `EventStaffLine`,
`HrGoal`, `HrGoalSpace`, `HrStaffRatio`, `HrStaffRatioSpace`, `HrSinkingRule`), `HrSupplier.departments`
répond bien à la place de `sectors`, et la contrainte unique de `HrSinkingRule` rejette bien un
doublon (`tenantId`, `roleId`, `fnbCategory`, `conditionAttribute`). Le point bloquant de §10.5
(« aucune table `Hr*` en base ») est donc levé. **Reste ouvert, hors périmètre de cette passe** :
la question #43 (source de `caPredictif`, `ElementPerformance` toujours vide) — `generate` continue
de renvoyer une dotation nulle tant qu'elle n'est pas tranchée.

### 11.2 BUG-122 — détection des tags F&B corrigée

`staffing.service.ts` comparait les sous-types Builder v2 (minuscules : `beverages`, `front_food`…)
après un `.toUpperCase()` contre des valeurs `UPPERCASE_SNAKE` (`'BEVERAGE'`…) qui ne matchaient
jamais. Remplacé par une table `SUBTYPE_TO_FNB_CATEGORY` explicite. Détail :
[`backend/docs/bugs/122_02_staffing_subtype_casing_mismatch_fnb_detection.md`](../../../backend/docs/bugs/122_02_staffing_subtype_casing_mismatch_fnb_detection.md).
C'est probablement la cause réelle derrière le ticket backlog **STF-1** (« la formule runners ajoute
un runner à tort ») : rejoué contre le code, la formule elle-même est correcte (question #28, déjà
résolue le 2026-07-29) — c'est la détection en amont qui ne nourrissait jamais le bon signal pour un
PDV créé dans le Builder v2.

### 11.3 STF-2 — table « Sinking RH » (dotation conditionnelle par sous-type)

Nouveau modèle `HrSinkingRule` (tenantId, roleId → HrRole, fnbCategory, conditionAttribute?,
conditionMinValue?, mandatoryQty) : force un quota minimal d'un rôle quand un tag FNB est détecté
sur un PDV et qu'une condition d'équipement optionnelle (ex. `nbFriteuses ≥ seuil`) est remplie.
Appliquée en **supplément** du calcul par paliers (§10.1), jamais à sa place — méthode pure
`StaffingCalculatorService.applySinkingRules()`, câblée dans `StaffingService.generate()` juste
après la boucle `ALGO_COUNT_FIELDS`, avec la même garde « ne jamais écraser une ligne MANUAL/userModified »
que le reste de l'algo. CRUD backend : `hr-sinking-rules.controller.ts` (mirroring
`hr-roles.controller.ts`). UI : section repliable dans `HrRoleFormDrawer.vue` (pas de nouvel écran),
visible seulement en édition d'un rôle déjà persisté ayant au moins un tag F&B sélectionné.
7 tests unitaires ajoutés (`staffing-calculator.service.spec.ts`).

### 11.4 CFG-1 — Mixology / Front Food / Kitchen Food (CFG-2 explicitement hors périmètre)

Ajoutés comme **sous-types du tool `shop` existant** dans la palette Builder v2
(`elementTaxonomy.js`), pas comme nouvelles valeurs d'`ElementType` — décision utilisateur, pour
éviter la migration d'enum + les 5 fichiers de mapping (backend `mapElementType`/`reverseMapElementType`,
DTO enum, `STAFFING_ELEMENT_TYPES`) qu'aurait exigés un vrai nouveau type de palette. Zéro migration,
zéro changement backend pour ce ticket seul. **CFG-2** (types de PDV entièrement dynamiques, chargés
depuis la BD) reste **délibérément hors périmètre** : le ticket lui-même indique que sa faisabilité
doit encore être discutée (« Ulrich voit la faisabilité avec Emmanuel ») — construire l'architecture
dynamique maintenant aurait contredit cette réserve. `hasKitchenFood` est câblé dans le calcul (§11.2)
avec un comportement par défaut conservateur, documenté comme question ouverte : voir
[question #44](../QUESTIONS_A_BERTRAND.md#questions-ouvertes).

### 11.5 RH-5 — renommage `HrSupplier.sectors` → `departments`

Renommage de bout en bout (schéma, backend, shim `utils/hrApi.js`, drawer, vue liste, i18n) — décision
utilisateur : garder la liste de valeurs actuelle (F&B/Hospitality/Merch/Ticketing/Access/Kitchen/Entertainment),
sans l'aligner sur `HrRole.department`/`HR_DEPARTMENTS` (liste distincte, 4 valeurs, sémantique différente).
Point trouvé en cours de route : le shim `frontend/src/utils/hrApi.js` (`supplierFromDb`/`supplierToDb`)
aurait cassé silencieusement l'écran Suppliers après la seule migration DB si son mapping interne
n'avait pas été renommé aussi. La mention du ticket « renommer aussi les éléments de la palette en
Département » ne correspond à rien dans le code — `PalettePanel.vue` (palette du Builder 3D) n'a
aucun champ « Secteur » ; probable confusion de l'auteur du ticket entre la palette d'outils du
Builder et la liste `HrSupplier` — non traité, à clarifier si le point est reformulé.

### 11.6 RH-2 — affichage Goal TPE / Staff par zone dans EventPredict

Affichage lecture seule dans l'onglet Staff d'EventPredict (`EventPredictStaffSection.vue`),
réutilisant le getter déjà résolu `staffing/settings` (aucun nouvel appel API, aucune nouvelle route
backend) + un lien vers la page RH Settings pour l'édition. Le câblage dans le Builder 3D reste hors
périmètre — il n'existe aujourd'hui aucun panneau de réglages par espace à étendre dans
`components/spaces/views/builder2/` ; en créer un est un chantier UI à part entière, non demandé pour
cette passe.

### 11.7 RH-1 / RH-3 / RH-4 — statut

RH-1 (formulaire StaffPosition complet) et RH-3 (page RH Settings, cartes par espace) étaient déjà
entièrement implémentés dans le code non déployé (§9, §10) — aucun changement de code, seul le
déploiement des tables (§11.1) les rend fonctionnels. RH-4 (harmonisation UI) : audit ciblé contre
l'écran fournisseur Market Price (référence explicite du code, commentaire « parité SupplierFormDrawer »)
— deux écarts concrets corrigés (sous-titre de drawer statique au lieu de varier Add/Edit ; largeur de
panneau 520px au lieu de 560px). L'écart structurel repéré (la référence propose une vue grille/carte
en plus de la table, RH n'a que la table) est noté comme décision de périmètre à confirmer plutôt que
construit d'office, les listes RH (agences, rôles) étant nettement plus courtes que le catalogue
Market Price.

### 11.8 Auto-remplissage du Staff dans le 3D Builder (STF-2, suite — 2026-07-30)

> Correction d'angle mort : §11.6 confond deux écrans différents. Le câblage laissé « hors périmètre »
> là-bas concerne les réglages Goal TPE/Staff-par-zone (niveau **espace**, §9). Il existe par ailleurs,
> **niveau stand**, une section **« Staff » dans l'inspecteur du Builder** (modèle `ElementStaff`,
> composant `StaffSection.vue`) — antérieure au module RH, 100 % manuelle (texte libre + quantité),
> qui ne communiquait ni avec les sous-types F&B cochés juste au-dessus dans le même panneau, ni avec
> les Rôles RH. C'est cette section-là que le ticket STF-2 visait avec « Staff auto-ajouté dans le 3D
> Builder selon le type » — repérée après coup, sur retour utilisateur avec captures d'écran à l'appui,
> après une première implémentation qui n'alimentait que la génération d'événement (§11.3).

**Ce qui a été fait** : `ElementStaff` gagne `roleId` (traçabilité du `HrRole` d'origine) et `source`
(`'AUTO'|'MANUAL'`, défaut `'MANUAL'` — toutes les lignes déjà en base avant cette migration sont
manuelles, aucune n'a jamais été auto-générée). Nouvelle route
`GET builder-v2/elements/:id/staff-suggestions` (`BuilderV2Service.getStaffSuggestions`). Côté
frontend, `StaffSection.vue` appelle cette route au montage et à chaque changement des sous-types de
l'élément sélectionné (debounce 400 ms), puis fusionne : les lignes `source='MANUAL'` ne sont jamais
touchées, les lignes `source='AUTO'` sont intégralement remplacées par le nouveau résultat — décocher
un sous-type fait donc disparaître la ligne au cycle suivant. Ajout **automatique, sans étape de
confirmation** (décision utilisateur).

**Limite assumée** : les règles Sinking **avec** condition d'équipement (`conditionAttribute`, ex.
« Kitchen Food + ≥ 1 friteuse ») ne se déclenchent jamais dans le Builder — aucun champ n'existe
aujourd'hui sur un stand pour saisir un nombre réel d'équipements (§10.4 point 3, toujours ouvert).
Décision utilisateur explicite : ne pas élargir cette passe pour construire ces champs de saisie —
chantier séparé, plus gros, à faire une prochaine fois.

### 11.9 Révision le jour même — le tag F&B seul doit suffire (retour utilisateur)

Première implémentation de §11.8 : un poste n'apparaissait que si une `HrSinkingRule` explicite avait
été créée pour lui (miroir strict d'`applySinkingRules`, déjà utilisé par la génération d'événement,
§11.3). Test réel : un rôle « Cuisinier » tagué `BEVERAGE` dans HR → Rôles, un stand avec le sous-type
Beverages coché — **rien ne se remplit**, parce qu'aucune `HrSinkingRule` n'existait nulle part en
base (vérifié : 0 ligne, tous tenants confondus). L'utilisateur attendait que le tag seul suffise, sans
étape de configuration supplémentaire.

**Nouvelle règle, implémentée** (méthode pure `StaffingCalculatorService.computeStaffSuggestions`,
7 tests dédiés) : un rôle dont `fnbCategories` contient une catégorie présente sur le stand apparaît
automatiquement, quantité **1 par défaut**. Une `HrSinkingRule` **sans condition** sur ce couple
(rôle, catégorie) ne fait qu'ajuster cette quantité par défaut. Une `HrSinkingRule` **avec condition**
rend au contraire ce couple (rôle, catégorie) **conditionnel** : il disparaît du défaut « tag seul » et
n'apparaît que si la condition est remplie (comportement inchangé pour le cas « EPR uniquement si
bain-marie » de la spec d'origine). Si un rôle matche plusieurs catégories présentes en même temps, la
quantité retenue est le **maximum** des quantités trouvées pour chacune, pas leur somme (un seul poste,
pas un doublon parce que deux tags se recoupent). Reconfirmé sur les données réelles (lecture seule,
aucune écriture) : le cas rapporté (Cuisinier/Beverage, 0 règle Sinking) produit désormais bien
`{ roleName: 'Cuisinier', qty: 1 }`.

**Deuxième retour, même test** : l'ajout manuel dans `StaffSection.vue` était un champ texte libre —
l'utilisateur voulait une liste des Rôles RH existants à sélectionner, jamais de saisie libre. Corrigé :
le champ texte est remplacé par un menu déroulant peuplé via `getHrRoles()`, le taux horaire du poste
ajouté est calculé depuis le rôle choisi (`hourlyRateFrom`, même formule que le backend) ; le poste
reste `source='MANUAL'` (jamais retouché par la synchronisation automatique), avec `roleId` renseigné
pour la traçabilité.

### 11.10 Design + deux bugs corrigés le même jour

**Design** : passage d'une liste plate à des cartes façon `InventorySection.vue` (même recette
`.inv-card`/`.inv-qty`), puis simplifié sur retour utilisateur (« texte en trop, épuré et intuitif ») —
suppression des titres de groupe « Recommandé (RH) »/« Ajouté manuellement », une seule liste, un icône
discret (`mdi-auto-fix`, info-bulle au survol) distingue une ligne `AUTO` d'une ligne `MANUAL` sans texte
permanent.

**Bug 1 — doublons** : rien n'empêchait de sélectionner deux fois le même rôle dans le menu déroulant
manuel. Corrigé : `selectableRoles` (computed) retire du menu tout rôle déjà présent dans la liste
(`roleId` déjà utilisé, auto ou manuel) — sélection impossible en double, le menu se réinitialise si le
rôle sélectionné disparaît (ex. absorbé par une synchronisation automatique entre-temps).

**Bug 2 — `property id should not exist`** : les lignes déjà enregistrées portent leur `id` serveur
(`staffByConfig`) ; les renvoyer telles quelles au `PUT .../staff` (whitelist + forbidNonWhitelisted)
déclenchait un 400 dès qu'on modifiait une quantité ou qu'on ajoutait une ligne à côté de lignes
existantes. Même bug déjà résolu ailleurs dans le Builder — `InventorySection.vue::cleanRow()` fait
exactement ça pour l'inventaire. Corrigé par un `cleanRow()` identique dans `StaffSection.vue::save()` :
ne renvoie que `position`/`count`/`hourlyRate`/`roleId`/`source`, jamais `id`.

### 11.11 Catégories F&B élargies de 4 à 9 (parité avec les sous-types Builder)

Autre test réel : cocher "Beer" à la place de "Beverages" ne faisait pas disparaître un poste tagué
"Beverage" — normal, `beer`/`beverages`/`drinkee` fusionnaient tous dans la même catégorie
`BEVERAGE` (héritage du fix BUG-122, pensé pour la formule de calcul, pas pour un tagging fin). Décision
utilisateur : chaque sous-type du panneau "Sous-types F&B" doit avoir sa propre catégorie RH. `HR_FNB_CATEGORIES`
passe de 4 à 9 (`FOOD, BEVERAGE, BEER, GP_PREMIUM, TEMPORARY, DRINKEE, MIXOLOGY, FRONT_FOOD, KITCHEN_FOOD`),
mapping 1:1 dans `fnb-tags.util.ts`. Aucune migration : `HrRole.fnbCategories`/`HrSinkingRule.fnbCategory`
sont de simples colonnes `TEXT`/`TEXT[]`, validées uniquement côté application — le rôle réel déjà en
production (`Cuisinier`, `BEVERAGE`/`FRONT_FOOD`) reste valide sans aucune action.

Deux garde-fous ajoutés pour ne rien casser :
- **La formule de calcul du personnel** (déjà validée, 43 tests) regroupe toujours `BEVERAGE`+`BEER`+`DRINKEE`
  sous `hasBeverage` — seul le *tagging* d'un rôle RH devient fin, la formule ne change pas de résultat
  (vérifié : un stand taggé seulement "beer" produit toujours `runners = MAX(runners, tireuses)`).
- **Collision `temporary`** : ce sous-type existe aussi sur le tool `merchshop` (valeur identique, tool
  différent). `BuilderV2Service.getStaffSuggestions` ne filtrait par aucun type d'élément — un élément
  `merchshop` taggé `temporary` aurait pu, à tort, déclencher un rôle RH catégorie `TEMPORARY`. Corrigé
  en restreignant `getStaffSuggestions` aux mêmes types que `generate()` (`STAFFING_ELEMENT_TYPES`),
  vérifié par test isolé (tenant jetable) : un stand `shop`/`temporary` suggère bien le rôle, un
  `merchshop`/`temporary` ne suggère jamais rien.

### 11.12 CFG-2 Étape 4.5 — `fnbCategories`/`fnbCategory` alignés sur le référentiel Subtype

Retour utilisateur (2026-07-31) après la CRUD-isation Department/Subtype (CFG-2, cf. §10.3) :
le champ Department du formulaire de rôle RH était déjà dynamique (référentiel global, filtré
`needsRh`), mais la grille "F&B Category (subtype)" restait `HR_FNB_CATEGORIES`, un vocabulaire
`UPPERCASE_SNAKE` codé en dur (9 valeurs) — un sous-type F&B créé par le super-admin via
Configurations n'y apparaissait jamais.

`HR_FNB_CATEGORIES` et la table de correspondance `SUBTYPE_TO_FNB_CATEGORY` (`fnb-tags.util.ts`)
sont supprimées. `HrRole.fnbCategories`/`HrSinkingRule.fnbCategory` stockent désormais directement
le `Subtype.code` — même idiome que `HrRole.department`/`Department.code` (§10.3).
`HrService.resolveFnbCategories()` valide l'existence contre `Subtype`, scopé au département
**du rôle** (généralisé au-delà de `shop` le 2026-07-31, cf. §11.13 — cette section décrivait
initialement un scope figé sur `shop`, corrigé depuis) et canonicalise vers `code ?? id`,
exactement comme `normalizeRole()` le fait pour `department`.

**Périmètre volontairement limité (à ce stade de cette section)** : `StaffingCalculatorService`
(pur, 43 tests) ne connaît pas le vocabulaire concret — il compare des chaînes opaques
(`fnbTags.has(rule.fnbCategory)`), donc inchangé. Seuls les 6 littéraux
`fnbTags.has('BEVERAGE'|'BEER'|...)` dans `StaffingService.generate()` sont renommés vers les
codes minuscules (`beverages`/`beer`/…) — même comportement, mêmes 3 catégories regroupées sous
`hasBeverage` (cf. §11.11), aucune formule touchée. `builder-v2.service.ts::getStaffSuggestions`
n'était pas encore touché à ce stade — cf. §11.13 pour sa généralisation.

**Migration** : `backend/scripts/backfill-hr-fnb-categories.ts` (DRY-RUN/`--apply`, idempotent)
réécrit les valeurs `UPPERCASE_SNAKE` déjà en base vers le `Subtype.code` correspondant (mapping
figé, les 9 valeurs historiques). Un seul rôle réel concerné en base au moment du changement
(`Cuisinier`, `[BEVERAGE, FRONT_FOOD]` → `[beverages, front_food]`), 0 `HrSinkingRule`. Vérifié par
script e2e jetable (tenant + Subtype de test nettoyés en fin de script) : ancien code
`UPPERCASE_SNAKE` désormais rejeté (plus de vocabulaire parallèle), sous-type d'un autre département
rejeté, et surtout — le point central de la demande — un `Subtype` fraîchement créé (`code: null`,
utilisable par son `id`) est immédiatement acceptable comme `fnbCategory`, sans backfill ni
changement de code.

Frontend (`HrRoleFormDrawer.vue`) : `FNB_CATEGORIES` (tableau figé) retiré, remplacé par un
`computed` réutilisant `buildTools()`/`toolOf('shop', …)` d'`elementTaxonomy.js` — les mêmes
fonctions déjà utilisées par le Builder (CFG-2 Étape 5) — sur le sous-type courant du référentiel
`departments` Vuex. Effet de bord positif : le libellé affiché passe de "Beverage" à "Beverages"
(`Subtype.name` réel), corrigeant au passage une divergence de wording avec le Builder. (Sourcé
sur `shop` fixe à ce stade — généralisé au département du rôle en §11.13.)

### 11.13 Généralisation au-delà de `shop` — la suggestion auto Builder marche pour tout département RH

Retour utilisateur (2026-07-31), suite à §11.12 : *"le choix du département doit nous permettre de
choisir le subtype auquel c'est censé être lié"*. La grille "Subtype" du formulaire de rôle restait
câblée en dur sur les sous-types `shop`, quel que soit le département choisi — un rôle Hospitality
(ex. "Hôte Lodge") ne pouvait jamais être tagué avec `lodges`/`salon`, ses propres sous-types.

Vérification préalable : `detectFnbTags()`/`StaffingCalculatorService.computeStaffSuggestions()`
étaient déjà **entièrement génériques** (aucun vocabulaire figé, comparaison de chaînes opaques) —
la limite à `shop` était purement artificielle, à deux endroits précis :

1. **`HrRoleFormDrawer.vue`** — `subtypeOptions` passe de `toolOf('shop', tools)` à
   `toolOf(form.department, tools)` : la grille propose désormais les sous-types du département
   **sélectionné sur le rôle**, pas toujours `shop`. Un `watch(() => form.department, ...)` filtre
   `form.fnbCategories` pour retirer les tags devenus invalides quand l'utilisateur change de
   département interactivement (sans effet quand `reset()` peuple un rôle déjà persisté, dont les
   tags sont déjà cohérents avec leur département). Libellé section renommé de "F&B Category
   (subtype)" à "Subtype" (+ nom du département affiché), plus F&B-only.
2. **`HrService.resolveFnbCategories(values, departmentId)`** — accepte désormais un `departmentId`
   (celui du rôle, résolu dans `normalizeRole()`/`assertValidSinkingRule()`), scope la requête
   `Subtype` dessus au lieu de `department: { code: 'shop' }`. `assertValidSinkingRule()` devient
   async et va chercher le département du rôle visé (`roleId`) pour scoper la validation.
3. **`BuilderV2Service.getStaffSuggestions()`** — remplace le filtre figé `STAFFING_ELEMENT_TYPES`
   (shop + legacy `fnb_*`) par une résolution dynamique du département de l'élément
   (`resolveDepartmentForElementType()`, repli des 5 valeurs legacy F&B sur `shop` d'abord),
   condition `dept.needsRh === true` — couvre les 6 départements RH (shop, hospitality, merchshop,
   entrance, entertainment, kitchen), pas seulement shop.

**Garde-fou de collision (le point le plus important)** : un `Subtype.code` n'est unique que **par
département** (`@@unique([departmentId, name])`), pas globalement — `temporary` existe à la fois
sur `shop` et `merchshop`, avec des sens différents. Avant ce changement, cette collision n'était
jamais un problème parce que `STAFFING_ELEMENT_TYPES` excluait déjà `merchshop` (BUG-122, §11.11).
En généralisant, `getStaffSuggestions()` filtre désormais explicitement les rôles considérés au
**même département que l'élément** (`hrRole.findMany({ where: { department: { in: [dept.code,
dept.id] } } })`) — sans ce scope, un rôle `shop` tagué `temporary` aurait pu être suggéré à tort
sur une box `merchshop` tagué `temporary` (même chaîne, sens différent). Vérifié par script e2e
jetable (tenant + espace/zone/éléments de test nettoyés) : rôle Hospitality `lodges` suggéré sur
une box Hospitality `lodges`, rôle merchshop `temporary` suggéré sur une box merchshop
`temporary`, **rôle shop `temporary` PAS suggéré** sur cette même box merchshop malgré la
collision de code — 8 assertions, toutes passées.

Le calcul par paliers événementiel (`StaffingService.generate()`, `algoKey`) reste **volontairement
non généralisé** : ses formules (caissiers/runners/barman…) sont conceptuellement F&B (CA
prédictif, TPE, trafic), sans équivalent métier pour Hospitality/Ticketing — seule la suggestion
auto **par élément** dans le Builder (`getStaffSuggestions`) est concernée par cette généralisation.

