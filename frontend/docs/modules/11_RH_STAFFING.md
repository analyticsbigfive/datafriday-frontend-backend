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
   `configuration`/`stockup`, [EventPredictView.vue:738-753](../../src/components/EventPredictView.vue)) — c'est l'objet de la question Bertrand **#22**, toujours ouverte.
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
| [#22](../QUESTIONS_A_BERTRAND.md) | Onglet Staff dans EventPredict Configuration Settings (contenu attendu) | 🔴 — non traité par l'étape 1 |
| [#28](../QUESTIONS_A_BERTRAND.md) | Règles xlsx « buguées » : lesquelles, et formules validées ? | 🔴 |
| [#29](../QUESTIONS_A_BERTRAND.md) | Persistance BDD des suppliers/positions (étape 2) | 🔴 |
| [#30](../QUESTIONS_A_BERTRAND.md) | Devenir d'`ElementStaff` (builder) vs bibliothèque RH | 🔴 |

## 8. Bugs actifs (fiches [`docs/bugs/`](../bugs/00_INDEX.md))

| Fiche | Résumé | Statut |
|---|---|---|
| [201](../bugs/229_props_double_majuscule_liaison_kebab_morte.md) | Props à double majuscule : liaison kebab-case silencieusement morte (`onOpenHR`, `onOpenFBIntegration`) — corrigé en camelCase sur la branche | 🟡 |
| [202](../bugs/230_consolidated_views_double_navigation_onclose.md) | `handleOpen*FromSettings` = handler + `onClose()` → double navigation ; contourné dans `HrView` (prop `onOpenEvents` omise) | ⚪ |
| [203](../bugs/231_ecrans_rh_routes_restes_prototype.md) | Restes de prototype (🟠) : crashs corrigés puis écrans remplacés par `components/hr/` Vuetify (5ᵉ passe) — plus rien d'ouvert sur `/hr` | 🟡 |
