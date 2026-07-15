# Page `/data-integration/fb` — Parcours complet

> Route : `DataIntegrationView.vue`  
> URL   : `http://localhost:8080/data-integration/fb`  
> Snapshot code : 14 mai 2026

---

## Sommaire

1. [Structure de la page](#1-structure-de-la-page)
2. [Écran A — Page principale (liste)](#2-écran-a--page-principale-liste)
3. [Écran B — Drawer "Ajouter une intégration"](#3-écran-b--drawer-ajouter-une-intégration)
4. [Écran C — Drawer "Configurer Weezevent"](#4-écran-c--drawer-configurer-weezevent)
5. [Popup — Sync Progress](#5-popup--sync-progress)
6. [Dialog — Suppression d'une intégration](#6-dialog--suppression-dune-intégration)
7. [Wizard — 4 étapes de configuration](#7-wizard--4-étapes-de-configuration)
8. [Logique handleSync](#8-logique-handlesync)
9. [API calls utilisés](#9-api-calls-utilisés)

---

## 1. Structure de la page

```
┌───────────────────────────────────────────────────────────────────┐
│  Sidebar (220px)     │  Main content                              │
│                      │                                            │
│  [Data Integration]  │  Titre : "Intégration F&B"   [+ Ajouter]  │
│  > F&B  ← actif      │                                            │
│                      │  [ cards grid ]                            │
└───────────────────────────────────────────────────────────────────┘
```

**Composants overlay :**
- `v-navigation-drawer` (droite) → Drawer Add / Config
- `SyncProgressDialog` → popup sync
- `v-dialog` → confirmation suppression
- `IntegrationWizard` → drawer fullscreen (740px) configuration post-ajout

---

## 2. Écran A — Page principale (liste)

### États possibles

```
┌─────────────────────────────────────────────────┐
│  Chargement                                     │
│  ─────────────────────────────────────────────  │
│  <v-progress-circular>                          │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Vide (aucune intégration)                      │
│  ─────────────────────────────────────────────  │
│  icône mdi-plus                                 │
│  "Aucune intégration configurée"                │
│  "Cliquez sur + pour en ajouter une"            │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Liste — cards-grid (flex wrap)                 │
│  ─────────────────────────────────────────────  │
│  [Carte intégration 1]  [Carte intégration 2]   │
└─────────────────────────────────────────────────┘
```

### Carte d'intégration

```
┌──────────────────────────────────────────────────┐
│ HEADER                                           │
│  [badge: Weezevent]  Nom instance     [✏] [✕]   │
├──────────────────────────────────────────────────┤
│ BODY                                             │
│  Créé le XX/XX/XXXX        Org: XXXX            │
│                                                  │
│  [⟳ Synchroniser / Syncing...]                  │
│  ─────────────────────────                       │
│  Espaces   [1 ▸]  ← toggle expand               │
│  ─ (expand) ─────────────────                    │
│  ✓ Nom espace       [✏]                         │
│  — ou —                                          │
│  (aucun)            [+]                          │
└──────────────────────────────────────────────────┘
```

**Actions :**

| Action | Déclencheur | Résultat |
|---|---|---|
| `✏` (header) | clic | Ouvre Drawer config-weezevent en mode édition |
| `✕` (header) | clic | Ouvre dialog confirmation suppression |
| `⟳ Synchroniser` | clic | Lance `handleSync(integration)` → popup SyncProgress |
| Toggle Espaces | clic | Expand/collapse section espaces (`expandedCards`) |
| `✏` (espace) | clic | Ouvre `IntegrationWizard` avec l'intégration |
| `+` (espace vide) | clic | Ouvre `IntegrationWizard` avec l'intégration |

---

## 3. Écran B — Drawer "Ajouter une intégration"

> `drawerMode = 'add'`  
> Largeur : 440px, depuis la droite

```
┌─────────────────────────────────────┐
│  Ajouter une intégration        [✕] │
├─────────────────────────────────────┤
│  Choisissez un connecteur           │
│                                     │
│  ┌──────────────────────────────┐   │
│  │ [logo] Weezevent          ❯  │   │  ← cliquable → config-weezevent
│  │         Caisse billetterie   │   │
│  └──────────────────────────────┘   │
│                                     │
│  ┌──────────────────────────────┐   │
│  │ [logo] Digifood   [Bientôt]  │   │  ← disabled
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## 4. Écran C — Drawer "Configurer Weezevent"

> `drawerMode = 'config-weezevent'`  
> Mode **création** (editingIntegrationId = null) ou **édition**

```
┌──────────────────────────────────────────┐
│  [←]  Configurer Weezevent          [✕] │
├──────────────────────────────────────────┤
│  Description courte                      │
│                                          │
│  Nom de l'instance  [________________]   │
│  Client ID *        [________________]   │
│  Client Secret *    [____________] [👁]  │
│  Organisation ID *  [________________]   │
│                                          │
│  [erreur si présente]                    │
│                                          │
│  — État 1 : connexion non testée —       │
│  [🔌 Tester la connexion]               │
│                                          │
│  — État 2 : connexion OK —              │
│  ✅ Connexion établie                    │
│  [💾 Enregistrer]                       │
│  [Modifier les identifiants]            │
│                                          │
│  — État 3 : sauvegarde OK —             │
│  ✅ Configuration sauvegardée           │
└──────────────────────────────────────────┘
```

### Flux de validation (2 étapes)

```
Saisie form
    │
    ▼
[Tester la connexion]
    │
    ├── FAIL → configError affiché, champs restent actifs
    │
    └── OK → connectionVerified = true
               Champs désactivés
               │
               ▼
           [Enregistrer & Connecter]
               │
               ├── FAIL → configError
               │
               └── OK → configSuccess = true
                          Si création → closeDrawer() + handleSync() auto (1s délai)
                          Si édition  → closeDrawer() (1s délai)
```

---

## 5. Popup — Sync Progress

> Composant : `SyncProgressDialog.vue`  
> Taille : 520px max-width, persistent

### Phase "en cours"

```
┌────────────────────────────────────────────────┐
│ ⟳  Synchronisation Weezevent                   │
│     Nom de l'intégration                       │
├────────────────────────────────────────────────┤
│                                                │
│  ○ Transactions     [⟳ démarrage...]           │
│    [████████░░░░░░] ← progress asymptotique    │
│                                                │
│  ○ Événements       [en attente]               │
│  ○ Lieux            [en attente]               │
│  ○ Produits         [en attente]               │
│                                                │
├────────────────────────────────────────────────┤
│  [Annuler]                                     │
└────────────────────────────────────────────────┘
```

### Phase "terminée"

```
┌────────────────────────────────────────────────┐
│ ✅  Synchronisation Weezevent                   │
│     Nom de l'intégration                       │
├────────────────────────────────────────────────┤
│                                                │
│  ✅ Transactions    1 234 en base (+56 nv) [3.2s]│
│  ✅ Événements      8 en base                  │
│  ✅ Lieux           12 en base                 │
│  ✅ Produits        45 en base                 │
│                                                │
│  ── Données en base ──────────────────         │
│  [1 234 Transactions] [8 Événements] [45 Produits]│
│                                                │
├────────────────────────────────────────────────┤
│  [Fermer]                                      │
└────────────────────────────────────────────────┘
```

### Comportement des étapes

Toutes les entités sont **extraites inline** lors du sync transactions — **aucun appel API supplémentaire vers Weezevent**. Les données viennent directement du champ `rows[]` et des champs d'en-tête de chaque transaction :

| Étape | Source dans la transaction | Modèle Prisma |
|---|---|---|
| Transactions | objet racine | `WeezeventTransaction` |
| Événements | `event_id` / `event_name` | `WeezeventEvent` |
| Lieux | `location_id` / `location_name` | `WeezeventLocation` |
| Produits | `rows[].item_id` / `item_name` | `WeezeventProduct` |

**Boucle de pagination :** max 20 itérations × 10 000 transactions = 200 000 max. Tant que `hasMore = true`, la boucle continue automatiquement.

---

## 6. Dialog — Suppression d'une intégration

```
┌──────────────────────────────────────────────┐
│  Supprimer l'intégration                     │
├──────────────────────────────────────────────┤
│  Vous êtes sur le point de supprimer         │
│  "Nom intégration". Action irréversible.     │
│                                              │
│  ☐ Supprimer aussi les données synchronisées │
│    (transactions, produits, événements…)     │
│                                              │
│                     [Annuler] [Supprimer 🔴] │
└──────────────────────────────────────────────┘
```

**Flux :**
1. Si checkbox cochée → `purgeWeezeventData(integrationId)` d'abord
2. Puis `deleteWeezeventInstance(tenantId, integrationId)`
3. Retire la carte de la liste locale

---

## 7. Wizard — 4 étapes de configuration

> Composant : `IntegrationWizard.vue`  
> Type : `v-navigation-drawer` temporaire, côté droit, **740px**  
> Déclenché depuis : bouton `+` ou `✏` dans la section Espaces de la carte

### En-tête du wizard

```
┌─────────────────────────────────────────────────────────────────────┐
│ [←]  📍 Nom de l'intégration        [2/4 étapes]              [✕] │
│      Configuration Weezevent                                        │
├─────────────────────────────────────────────────────────────────────┤
│  ①━━━━━━━━━━━②━━━━━━━━━━━③━━━━━━━━━━━④                            │
│  Espace   Locations   Produits   Événements                         │
└─────────────────────────────────────────────────────────────────────┘
```

Les étapes déjà complétées sont cliquables pour y revenir.

---

### Écran 0 — Overview (WizardOverview)

Affiché à l'ouverture si `showOverview = true`.

```
┌──────────────────────────────────────────────┐
│         ⚙️ Configuration de l'intégration    │
│              « Nom intégration »             │
│   Avant que les données apparaissent dans    │
│   vos analyses, 4 étapes sont nécessaires.   │
│                                              │
│  ① ⬜ Associer un espace        [À faire]    │
│  ② ⬜ Mapper les Locations      [À faire]    │
│  ③ ⬜ Mapper les produits menu  [À faire]    │
│  ④ ⬜ Traitement des événements [À faire]    │
│                                              │
│         [Commencer la configuration →]       │
└──────────────────────────────────────────────┘
```

---

### Étape 1 — Associer un espace (StepMapSpace)

```
┌──────────────────────────────────────────────┐
│ 🔴│ Associer les données de « X » à un espace│
│   │ — Étape 1                                │
│   │ Sélectionnez un espace existant ou créez-│
│   │ en un. Toutes les locations (PdV) seront │
│   │ rattachées à cet espace.                 │
├──────────────────────────────────────────────┤
│                                              │
│  [💡 Suggestion : "Nom similaire"  85%]      │
│                                [Utiliser]    │
│                                              │
│  Sélectionner un Space existant  [▾]         │
│                                              │
│  ── ou ──                                    │
│                                              │
│  Nom du nouveau space [______________]       │
│  [Créer cet espace]                          │
│                                              │
│  ✅ Space sélectionné avec succès            │
│                                              │
│                      [Continuer →]           │
└──────────────────────────────────────────────┘
```

**Logique :** Appelle l'API pour lister les spaces du tenant. Calcule une suggestion par similarité de nom (score %). Si espace sélectionné → sauvegarde le mapping `integrationId → spaceId`.

---

### Étape 2 — Mapper les Locations / points de vente (StepMapShops)

```
┌──────────────────────────────────────────────┐
│ 🔴│ Mapper les Locations (points de vente)   │
│   │ — Étape 2          [3/5 mappés]          │
│   │ Associez chaque location Weezevent       │
│   │ à un shop DataFriday.                    │
├──────────────────────────────────────────────┤
│  ⚡ 2 suggestions auto disponibles           │
│                          [Tout appliquer]    │
│                                              │
│  [✅ Mappés] [⚠ Non mappés] [Tous]          │
│                                              │
│  Buvette B          →  [Buvette B ▾]   [💾] │
│  Buvette Principale →  [Non mappé  ▾]  [💾] │
│  …                                           │
│                                              │
│                      [Continuer →]           │
└──────────────────────────────────────────────┘
```

**Logique :** Appelle `getWeezeventLocations(integrationId)` → charge les enregistrements `WeezeventLocation` de cette intégration. Propose des auto-suggestions par similarité de nom (seuil 70%). Chaque mapping est sauvegardé via `createLocationShopMapping` avec la clé `weezeventLocationId = location.id`.


---

### Étape 3 — Mapper les produits menu (StepMapMenuItems)

```
┌──────────────────────────────────────────────┐
│ 🔴│ Mapper les produits du menu              │
│   │ — Étape 3          [12/20 mappés]        │
│   │ Mappez chaque produit Weezevent à un     │
│   │ article de votre menu DataFriday.        │
├──────────────────────────────────────────────┤
│  ⚡ 5 suggestions auto disponibles           │
│                          [Tout auto-mapper]  │
│                                              │
│  [✅ Mappés] [⚠ Non mappés] [Tous]          │
│                                              │
│  COCA 50cl    →  [Coca-Cola 50cl ▾]   [💾]  │
│  BIERE        →  [Non mappé      ▾]   [💾]  │
│  …                                           │
│                                              │
│                      [Continuer →]           │
└──────────────────────────────────────────────┘
```

**Rôle dans le pipeline :** L'étape 3 **n'est pas utilisée par `processEvents`** (étape 4). Elle est utilisée **au moment de la lecture** des analytics, dans la requête SQL granulaire de `spaces.service.ts`.

```sql
-- Chaîne de jointure activée par le mapping étape 3 :
WeezeventTransactionItem (productId)
  → WeezeventProductMapping (weezeventProductId → menuItemId)
  → MenuItem (name, picture, totalCost)
  → ProductType (name)
  → ProductCategory (name)
```

| Sans mapping étape 3 | Avec mapping étape 3 |
|---|---|
| Produit visible dans les ventes | Produit lié à ton menu DataFriday |
| Pas de nom/catégorie/coût | `menuItemName`, `menuItemType`, `menuItemCategory`, `itemCost` disponibles |
| Pas de calcul de marge | Marge calculable (`revenueHt − itemCost × quantity`) |

> Le mapping est un `LEFT JOIN` : les produits non mappés restent visibles dans les analytics mais sans les dimensions `menuItemName/Type/Category`.

---

### Étape 4 — Traitement des événements (StepProcessTimeline)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔴│ Traitement des événements                                        │
│   │ — Étape 4                                  [3/5 traités ✓]      │
│   │ Traitez les événements pour agréger les données de vente.        │
│   │ Après traitement, visualisez la timeline minute par minute.      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ [Événements enregistrés  3] [Dates non couvertes  ⚠2] [Weezevent  8]│
└──────────────────────────────────────────────────────────────────────┘
```

---

#### Tab 1 — Événements enregistrés

> Source : `Event` DataFriday liés à l'espace. C'est sur ces événements que `processEvents` écrit les agrégats.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⚠ Aucun mapping boutique configuré (si étape 2 non faite)          │
│  → Revenez à l'étape 2 pour associer les locations Weezevent.       │
└──────────────────────────────────────────────────────────────────────┘

  [⟳ Tout traiter]    ← bulk action : processEvents sur tous les events

  ┌────────────────────────────────────────────────────────────────────┐
  │  SF Saison 2019-20       05/09/2019 → 30/06/2020        [✅ Traité]│
  │  CA HT : 142 350 €   |   1 234 transactions   |   5 shops         │
  │                                          [↺ Re-traiter] [▾ Timeline]│
  ├────────────────────────────────────────────────────────────────────┤
  │  ▾ Timeline minute par minute — SF Saison 2019-20                  │
  │                                                                    │
  │  Shops actifs : Buvette B · Buvette Principale · Merchandising     │
  │  Filtrer par shop : [Tous ▾]   Filtrer par article : [Tous ▾]     │
  │                                                                    │
  │  CA HT (€) par minute                                             │
  │  1 200 ┤                                                           │
  │    900 ┤     ██                                                    │
  │    600 ┤  ██ ██ ██                                                 │
  │    300 ┤  ██ ██ ██ ██     ██                                       │
  │      0 └──────────────────────────────────────→ 19:30  20:15  21:00│
  │                                                                    │
  │  ── Détail par minute ──────────────────────────────────────────── │
  │  Minute  Shop               Article          Qté  Transac  CA HT  │
  │  ──────  ─────────────────  ───────────────  ───  ───────  ──────  │
  │  19:42   Buvette B          Coca-Cola 50cl    12       8   36,00 €│
  │  19:42   Buvette B          Bière Pression     8       6   40,00 €│
  │  19:42   Buvette Principale Eau minérale       5       4   10,00 €│
  │  19:43   Buvette B          Coca-Cola 50cl     9       7   27,00 €│
  │  19:43   Merchandising      Écharpe club       3       3   45,00 €│
  │  …                                                                 │
  │                                              [Télécharger CSV ↓]  │
  └────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────┐
  │  Coupe de France 2021-22     12/03/2022              [⏸ Non traité]│
  │  Données en attente de traitement                                  │
  │                                            [▶ Traiter cet event]  │
  └────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────┐
  │  Ligue 1 — Match 28          15/04/2023           [⟳ En cours...] │
  │  ████████████░░░░░░░  Agrégation en cours…                        │
  └────────────────────────────────────────────────────────────────────┘
```

---

#### Tab 2 — Dates non couvertes

> Dates de transactions `WeezeventTransaction.transactionDate` sans `Event` DataFriday correspondant.

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  ℹ Ces dates ont des transactions sans événement DataFriday.    │
  │  Créez un événement pour couvrir la période et pouvoir traiter  │
  │  ces données.                                                    │
  └──────────────────────────────────────────────────────────────────┘

  Date           Transactions   CA estimé      Action
  ─────────────  ────────────   ───────────    ────────────────────────
  03/10/2020         47          1 240 €       [+ Créer un événement]
  17/11/2020        120          3 890 €       [+ Créer un événement]
```

---

#### Tab 3 — Événements Weezevent

> Source : `WeezeventEvent` (billetterie, syncés depuis l'API). **Différents** des `Event` DataFriday. Enrichissement et sync spectateurs ici.

```
  [⟳ Sync tous les spectateurs]   ← appelle WeezPay API → WeezeventEvent.attendees

  ┌──────────────────────────────────────────────────────────────────┐
  │  SF vs PSG — L1 J12         12/10/2019    👥 42 300 spectateurs  │
  │  ▾ Enrichir                                                      │
  ├──────────────────────────────────────────────────────────────────┤
  │  Ouverture portes  [19:00]   Coup d'envoi  [20:00]               │
  │  Catégorie         [Ligue 1 ▾]                                   │
  │  Équipe domicile   [SF          ]   Visiteur  [PSG         ]     │
  │  Mi-temps          [✓] Présente  ← corrèle le pic de vente 21:45 │
  │                                                     [💾 Sauver]  │
  └──────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────┐
  │  Coupe de France — 8e        08/02/2020    👥 — [⟳ Sync spect.] │
  │  ▸ Enrichir                                                      │
  └──────────────────────────────────────────────────────────────────┘
  …

```

---

#### Footer

```
┌──────────────────────────────────────────────────────────────────────┐
│  3/5 événements traités       0 dates non couvertes restantes        │
│                                                      [Terminer ✓]   │
└──────────────────────────────────────────────────────────────────────┘
```

#### Ce que fait réellement "Traiter" (`processEvents`)

C'est **l'étape qui produit les données analytics**. Sans elle, toutes les tables d'agrégation sont vides et aucun graphique ne s'affiche.

**Flux complet pour chaque `Event` DataFriday :**

```
Pour chaque Event (DataFriday) de l'espace :
│
├─ Charge toutes les WeezeventTransaction du jour de l'event
│   filtrées par : integrationId + locationId ∈ locations de l'intégration
│
├─ Groupe le CA par locationId (point de vente physique)
│
├─ Pour chaque location avec du CA :
│   ├─ Cherche WeezeventLocationShopMapping
│   │    WHERE weezeventLocationId = locationId  ← configuré à l'étape 2
│   │
│   ├─ Si mapping trouvé → UPSERT SpaceRevenueDailyAgg
│   │    (tenantId, spaceId, day, weezeventEventId, locationId, spaceElementId,
│   │     revenueHt, transactionsCount, itemsCount)
│   │
│   └─ Si mapping absent → locationId listée en "non mappée" (warning)
│
└─ Groupe aussi le CA par produit → UPSERT SpaceProductRevenueDailyAgg
    (tenantId, spaceId, day, weezeventProductId, revenueHt, quantity)
```

**Dépendance critique avec l'étape 2 :**
Le traitement ne produit des données que pour les locations **mappées** à l'étape 2. Une location sans mapping = ses transactions sont ignorées dans les agrégats.

#### Les 3 onglets

| Onglet | Contenu | Modèle source |
|---|---|---|
| Événements enregistrés | `Event` DataFriday liés à l'espace — ce sont eux qu'on "traite" | `Event` |
| Dates non couvertes | Dates de transactions sans `Event` configuré | calculé depuis `WeezeventTransaction.transactionDate` |
| Événements Weezevent | `WeezeventEvent` syncés depuis l'API (billetterie) — pas les mêmes que les `Event` DataFriday | `WeezeventEvent` |

> **Distinction importante :** `Event` (DataFriday) = le match/concert créé manuellement dans l'espace. `WeezeventEvent` = l'événement de billetterie côté Weezevent. Ce sont deux entités séparées.

#### Enrichissement des WeezeventEvent (onglet 3)

Chaque `WeezeventEvent` peut être enrichi avec des métadonnées pour les analyses avancées :

| Champ | Usage analytics |
|---|---|
| `doorsOpening` | Heure d'ouverture des portes |
| `showTime` | Heure de début du spectacle |
| `category` | Type d'événement |
| `team` / `visitingTeam` | Équipes (sport) |
| `hasIntermission` | Présence d'une mi-temps → corrélation pic de vente |

#### Sync des spectateurs

Bouton "Sync spectateurs" → appelle WeezPay API → enregistre le nombre de spectateurs dans `WeezeventEvent.attendees`. Utilisé pour calculer le **CA par spectateur** dans les analytics.
```

---

### Écran Succès (WizardSuccess)

```
┌──────────────────────────────────────────────┐
│           🎉 Configuration terminée !        │
│                                              │
│   L'intégration « Nom » est prête.          │
│   Les données Weezevent seront visibles      │
│   dans vos analyses.                         │
│                                              │
│         [Voir les données] ou [Fermer]       │
└──────────────────────────────────────────────┘
```

---

## 8. Logique handleSync

```
handleSync(integration)
│
├─ Si sync déjà en cours → re-show dialog (pas de double sync)
│
├─ Init STEPS = [transactions, events, locations, products, merchants]
│   → tous status: 'pending'
│
├─ Charge dernière date sync (getWeezeventSyncStatus) — non bloquant
│
└─ Boucle (max 20 itérations) :
    │
    ├─ setStep('transactions', running)
    ├─ POST /weezevent/sync { type: 'transactions', integrationId }
    │   timeout: 120s
    │
    ├─ Réponse : { count, eventCount, locationCount, productCount,
    │              merchantCount, itemsCreated, hasMore, duration }
    │
    ├─ Si hasMore=true → loop continue (transactions reste 'running')
    │
    └─ Si hasMore=false → loop stop
         setStep transactions → 'done' avec count + newCount + duration
         setStep events      → 'done' avec eventCount
         setStep locations   → 'done' avec locationCount
         setStep products    → 'done' avec productCount
         setStep merchants   → 'done' avec merchantCount
```

### Stratégie de sync côté backend (`syncTransactionsIncremental`)

| Appel | Mode | Comportement |
|---|---|---|
| Premier sync (DB vide) | **FULL** | `fromDate = null` → récupère toutes les transactions depuis Weezevent |
| Syncs suivants | **INCRÉMENTAL** | `fromDate = lastSyncedAt − 5 min` → filtre envoyé à l'API Weezevent |

**Pagination :** `batchSize = 500` transactions/page, `MAX_ITEMS_PER_RUN = 10 000` par appel. Si la limite est atteinte avant la fin, le backend retourne `hasMore: true` et le frontend relance.

**Détection de fin de pagination (array API) :** L'API Weezevent renvoie parfois un tableau brut sans métadonnées. Le client recalcule `total_pages = current_page + 1` si la page est pleine, `current_page` sinon. La boucle s'arrête quand la page est partielle ou vide.

**Protection anti-boucle infinie :** si une page entière est composée uniquement de transactions déjà connues en DB (mode incrémental), la boucle s'arrête immédiatement — l'API Weezevent ignore le paramètre `from_date` dans ce cas.

### Bug corrigé — boucle infinie sur les syncs incrémentiels (14 mai 2026)

**Symptôme :** après le premier sync à 18h, le CRON (toutes les 10 min) continuait à réinsérer les mêmes transactions en boucle pendant des heures.

**Cause :** `getExistingTransactionIds()` filtrait par `transactionDate >= fromDate`. Or `transactionDate` est la date d'achat originale (ex. `2019-09-07`), et `fromDate = lastSyncedAt − 5min = 2026-05-14T17:55`. Aucune transaction historique ne passait le filtre → `existingIds = {}` vide → toutes les transactions semblaient "nouvelles" → `createMany(skipDuplicates: true)` retournait 0 insérées mais `hasMore = true` → la boucle repartait.

**Corrections :**
1. `getExistingTransactionIds` : suppression du filtre `transactionDate` — tous les IDs existants de l'intégration sont chargés sans restriction de date.
2. Sortie anticipée dans la boucle : si une page entière est entièrement skippée (mode incrémental, `newTransactions.length === 0`), `hasMore = false` et la boucle s'arrête immédiatement.

---

## 9. API calls utilisés

| Fonction | Méthode + URL | Usage |
|---|---|---|
| `listWeezeventInstances(tenantId)` | `GET /weezevent/instances` | Init — charge les cartes |
| `createWeezeventInstance(tenantId, body)` | `POST /weezevent/instances` | Drawer config — création |
| `updateWeezeventInstance(tenantId, id, body)` | `PATCH /weezevent/instances/:id` | Drawer config — édition |
| `deleteWeezeventInstance(tenantId, id)` | `DELETE /weezevent/instances/:id` | Dialog suppression |
| `testWeezeventCredentials(tenantId, body)` | `POST /weezevent/test-credentials` | Drawer config — test connexion (création) |
| `testWeezeventInstance(tenantId, id, body)` | `POST /weezevent/instances/:id/test` | Drawer config — test connexion (édition) |
| `purgeWeezeventData(integrationId)` | `DELETE /weezevent/data/:id` | Dialog suppression (si checkbox) |
| `syncWeezeventData('transactions', opts)` | `POST /weezevent/sync` | handleSync — sync transactions |
| `getWeezeventSyncStatus(integrationId)` | `GET /weezevent/sync-status/:id` | handleSync — dernière date sync |
| `getLocationSpaceMappings()` | `GET /mappings/location-space` | Init — charge les mappings |
