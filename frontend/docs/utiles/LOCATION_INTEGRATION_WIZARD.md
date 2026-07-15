# LocationIntegrationWizard.vue — Analyse détaillée

> Ce document couvre deux niveaux : d'abord la **logique interne** (flux de données, appels API, algorithmes) puis la **description UX** (ce que l'utilisateur voit et fait).

---

## Architecture technique du composant

Le wizard est un **composant Options API Vue 2** monolithique (~6500 lignes). Il n'utilise aucun composable externe : toute la logique (état, méthodes asynchrones, appels réseau) est inline dans l'objet `methods`. Les appels serveur passent par deux modules utilitaires :

- `src/utils/api` — opérations CRUD sur les entités (spaces, configurations, mappings…)
- `src/utils/supabase/info` — fournit `projectId` et `publicAnonKey` pour appeler les **Supabase Edge Functions** directement via `fetch()`

---

## Flux logique complet, étape par étape

---

### Étape 1 — Persistance du mapping location → espace (`handleMapSpace`)

Quand l'utilisateur clique « Next » depuis `map-space`, `handleMapSpace()` est appelé :

```
api.saveLocationSpaceMapping(location, selectedSpace.id, selectedSpace.name)
   → POST /api/location-space-mappings  { location, spaceId, spaceName }
```

Ce record est la clé de voûte : toutes les opérations suivantes utilisent `selectedSpace.id` (et non le nom de la location) pour requêter les données.

Ensuite, `loadShopMappingData()` est appelé automatiquement pour préparer l'étape 2.

---

### Étape 2 — Construction de la table de mapping shops (`loadShopMappingData`)

C'est l'algorithme le plus complexe. Il se déroule en 5 phases :

**Phase 1 — Chargement des sources**
```
api.getShopsForSpace(spaceId)          → liste des noms de shops bruts du POS
api.getSpaceConfigurations(spaceId)    → configurations de l'espace (plans de salle)
```

**Phase 2 — Extraction des F&B elements depuis le registre**

Chaque configuration contient un `fbElementsRegistry` (dictionnaire d'éléments partagés entre configurations). Pour chaque élément de type `"shop"` non archivé, le code :
1. Lit ses `configurations[configId].floorElementIds` (IDs physiques sur le plan)
2. Construit une table `floorIdToRegistryId : { floorElementId → registryId }`
3. Ajoute l'élément à `fbElements` avec son `id = registryId`

Si le registre est absent (espaces legacy), il itère à la main sur `floors[]`, `forecourt.elements[]` et `externalMerch.elements[]`.

**Phase 3 — Chargement des mappings persistés**
```
api.getShopElementMappings(spaceId)    → tableau de { shopName, elementId, configId }
```
Pour chaque mapping récupéré :
- Si `elementId` commence par `"registry-"` → déjà correct
- Sinon → traduction via `floorIdToRegistryId[elementId]` pour migrer vers les registry IDs

**Phase 4 — Auto-matching des shops non encore mappés (`findBestElementMatch`)**

Pour chaque shop sans mapping en base :
```js
calculateSimilarity(shopName, elementName)
// Logique : exact match → 1.0 | substring → 0.8 | mots communs → score proportionnel
// Seuil minimum : 0.6 pour déclencher un auto-match
// Contrainte   : un élément déjà auto-matché est exclu pour éviter les doublons
```

**Phase 5 — Fusion avec les mappings non sauvegardés**

Les changements faits en UI mais pas encore persistés (dans `this.shopMappings`) sont préservés si différents du dernier état en base.

---

### Persistance des mappings (`handleSaveShopMappings`)

Quand l'utilisateur clique « Next » depuis `map-shops` :

```
api.saveShopElementMappings(spaceId, mappingsToSave)
   → POST /api/shop-element-mappings  [{ shopName, spaceId, elementId, elementName, configId, floorElementIds }]
```

Puis, **pour chaque mapping**, le code met à jour le nom de l'élément dans la configuration :

```
configData.floors[].elements.find(el => el.id === elementId).name = shopName
api.saveConfiguration(updatedConfig)   → PATCH /api/configurations/:id
```

Cela synchronise le nom affiché sur le plan de salle avec le nom POS réel.

---

### Transition vers `process-timeline` (`handleNext` depuis `menu-mapping`)

Avant de passer à l'étape 4, trois opérations sont effectuées en séquence :

**1. Migration des IDs shop :**
```
api.migrateShopElementIds(location, spaceId)
   → POST /api/migrate-shop-element-ids
   Convertit les anciens floor-IDs en registry-IDs dans les mappings persistés
```

**2. Reconstruction des tables consolidées :**
```
await Promise.all([
  api.rebuildShopMappings(spaceId),    → POST /api/rebuild-shop-mappings
  api.rebuildMenuMappings(spaceId),   → POST /api/rebuild-menu-mappings
])
```
Ces deux appels génèrent les tables dénormalisées que le pipeline de traitement de timeline utilisera : une vue plate `{ shopName → registryElementId }` et `{ menuItemName → menuItemId }`.

---

### Étape 4 — Traitement de la timeline (`processSingleEventTimeline`)

Pour chaque événement, un appel direct à une **Supabase Edge Function** :

```
POST https://{projectId}.supabase.co/functions/v1/make-server-eb31619c
     /sales/process-single-event-timeline
     { location, eventId }
```

En parallèle, un **polling à 1 Hz** interroge l'avancement :
```
GET /sales/event-timeline-progress/{eventId}
   → { success, progress: { processed, total, ... } }
```

Résultat de chaque appel : `{ eventName, totalTransactions, dataPoints, processingTimeSeconds, rowsPerSecond }`. Le champ `dataPoints` représente le nombre de combinaisons uniques (minute × shop × article) avec des transactions.

**`processAllEventsTimeline()`** est un simple alias de `processAllEvents()` qui itère sur tous les événements non traités et appelle `processSingleEventTimeline` pour chacun.

---

### Étape 5 — Synchronisation des données agrégées (`regenerateAggregatedData`)

Séquence d'appels aux Edge Functions :

**1. Nettoyage :**
```
POST /cleanup-shop-perf-event  { spaceId }
→ Supprime tous les enregistrements shop-perf existants pour l'espace
```

**2. Traitement par événement (boucle séquentielle) :**
```
Pour chaque event passé (eventDate ≤ aujourd'hui) :
  POST /process-event-shop-performance  { spaceId, eventId }
  → Calcule les métriques shop×article pour cet événement depuis la timeline
  → result: { success, skipped?, eventName, recordCount }
```
Les événements futurs sont automatiquement exclus. Les événements sans données sont marqués `skipped`.

**3. Finalisation globale :**
```
POST /finalize-shop-performance  { spaceId }
→ Agrège tous les enregistrements par événement en totaux globaux par espace
→ result: { success, shopCount, menuItemCount }
```

À la fin, un `setTimeout(3000)` ferme le wizard automatiquement et appelle `onComplete()` si fourni.

---

## Rôle global

Ce composant est un **assistant d'intégration pas-à-pas** (*wizard*). Son objectif est de prendre des données de transaction brutes importées depuis un système POS (par exemple Weezevent) pour une « location » (un lieu d'événement) et de les raccorder à la structure analytique de Datafriday. À l'issue du wizard, les données sont entièrement traitées et consultables dans la vue Analyse.

Le wizard comprend **6 étapes** matérialisées par une barre de progression persistante en haut du composant. Chaque étape est cliquable et affiche une icône de complétion (✓ verte) quand elle est terminée.

---

## Étape 1 — Map Space (`map-space`)

### Ce qui se passe concrètement

L'utilisateur associe la location à un **espace physique** de la bibliothèque Datafriday. Un espace représente la structure physique d'un lieu (une salle, une arène…). C'est la racine de toute la hiérarchie : configurations → éléments F&B → articles de menu.

L'interface propose deux chemins :

- **Sélectionner un espace existant** depuis une liste. Le système suggère automatiquement un espace pertinent (badge « Suggested »), vraisemblablement par correspondance de nom avec la location.
- **Créer un nouvel espace** en renseignant : nom, nombre d'étages au-dessus du sol (1–10), niveaux de sous-sol (0–5), et deux options booléennes (forecourt, zone externe). Ces paramètres structurent ensuite le plan de salle.

L'étape est bloquante : le bouton « Next » du footer est conditionné à `selectedSpace` non nul.

---

## Étape 2 — Map Shops (`map-shops`)

### Ce qui se passe concrètement

Les données POS contiennent des noms de points de vente bruts (les « shops »), qui ne correspondent pas nécessairement aux noms définis dans les configurations de l'espace (les « F&B elements »). Cette étape crée la **table de correspondance** entre les deux.

Pour chaque shop présent dans les données importées, l'utilisateur choisit dans un sélecteur l'élément F&B auquel il correspond. Le système propose automatiquement une suggestion par **score de similarité de chaîne** (affiché en % avec une étoile ⭐).

Deux mécanismes importants :

- **Multi-mapping** : plusieurs noms de shops peuvent pointer vers le même élément F&B. C'est utile si un stand a été renommé entre deux saisons. Le chiffre d'affaires de toutes les sources est alors cumulé.
- **Création à la volée** : si aucun élément F&B ne convient, l'option « + Create New Shop » permet d'en créer un directement.

Un compteur `mappedShopCount / totalShopCount` indique la progression. En cas d'absence totale d'éléments F&B, un bloc d'erreur rouge apparaît avec des outils de diagnostic (vider le cache, afficher les logs, lister les mappings en base).

---

## Étape 3 — Menu Mapping (`menu-mapping`)

### Ce qui se passe concrètement

Délégué entièrement au sous-composant `MenuMappingStep`, cette étape opère le même principe que l'étape 2 mais sur les **articles** plutôt que sur les shops. Les « menu items » sont les articles bruts du POS, les « fnb items » sont les articles définis dans la bibliothèque Datafriday.

Ce qui se distingue ici est le système de **staging** : les correspondances sont d'abord accumulées dans `stagedChanges` (sans être persistées), puis soumises en une seule opération via `applyAllStagedChanges`. Cela permet à l'utilisateur de préparer plusieurs mappings et de les valider en bloc. La barre `applyProgress` indique l'avancement de l'application.

Le système suggère automatiquement un article Datafriday (`getSuggestedMenuItem`) pour chaque item POS, et il est possible de créer un nouvel article de bibliothèque si aucun existant ne convient.

---

## Étape 4 — Process Event Timeline (`process-timeline`)

### Ce qui se passe concrètement

C'est l'étape centrale du pipeline. Elle transforme les données de transaction brutes en **entrées de timeline minute par minute** — format qui constitue la source de vérité unique à partir de laquelle toutes les vues analytiques seront calculées. Chaque entrée représente une combinaison unique (minute × shop × article).

L'étape s'organise autour de deux onglets :

### Onglet « Registered Events »

Liste tous les événements enregistrés dans la bibliothèque pour cet espace. Chaque événement affiche sa date, son statut (`isProcessed` ou non) et, s'il est traité, le nombre de datapoints générés. Pour chaque événement, trois actions sont disponibles : *Process*, *Reprocess* (si déjà traité), ou *Skip*. Un traitement de masse « Start Event Timeline Processing » / « Reprocess All Events » est également disponible.

Pendant le traitement d'un événement individuel, un indicateur de progression temps réel (`EventTimelineProgressIndicator`) apparaît. Les événements futurs sont automatiquement exclus (pas de données de vente disponibles).

### Onglet « Unregistered Dates »

Dates pour lesquelles des données de vente existent dans les données importées mais aucun événement n'est enregistré dans la bibliothèque. Pour chacune, le montant total de transactions est affiché. Le bouton « Create Event » ouvre une modale complète pour créer l'événement manquant à la volée.

### Condition de passage

Le bouton « Next » du footer est bloqué tant que le message de traitement ne commence pas par « All » (indiquant que tous les événements ont été traités ou ignorés).

---

## Étape 5 — Synchronize Aggregated Data (`synchronize-data`)

### Ce qui se passe concrètement

À partir de la timeline traitée à l'étape 4, cette étape calcule et persiste l'ensemble des **vues agrégées** nécessaires à la vue Analyse :

- Performances par shop (revenus, volumes)
- Revenus par article de menu
- Métriques de synthèse à l'échelle de l'espace

Le traitement est séquentiel événement par événement, avec une barre de progression (`eventTimelineProgress.current / eventTimelineProgress.total`). Deux systèmes de traitement coexistent : un nouveau pipeline par événement (affiché directement) et l'ancien `ShopPerformanceProgressIndicator` maintenu pour la compatibilité ascendante.

En cas d'échec, le bouton « Retry Data Synchronization » relance via `forceRestartShopPerformance`. À la complétion, un message de succès confirme les 4 catégories de données générées et le wizard redirige automatiquement vers la vue Data Integration.

---

## Étape 6 — Finalizing Data (`finalizing-data`)

### Ce qui se passe concrètement

Étape terminale automatique, présentée en pleine page centrée. Elle joue le rôle de **page de statut finale** : une icône dynamique (spinner → ✓ verte ou ✗ rouge), un titre d'état, et un récapitulatif des données produites. Elle est commentée « now Step 8 » dans le code, indiquant qu'elle a été déplacée dans la numérotation au fil des évolutions.

En cas d'erreur partielle, un message rassure l'utilisateur : le wizard peut se fermer même si certaines données n'ont pas pu être finalisées, simplement avec des performances de chargement dégradées dans la vue Analyse.

---

## Modale d'ajout d'événement (hors étapes)

Accessible depuis l'onglet « Unregistered Dates » de l'étape 4, cette modale est un formulaire complet de création d'événement. Elle adapte dynamiquement ses champs selon les sélections :

- **Performer Name** — uniquement si le type d'événement est de type entertainment
- **Home Team / Visiting Team** — uniquement si la catégorie a `hasHomeTeam = true`
- **Sponsor** — uniquement si la catégorie est de type tradeshow

Elle gère également la configuration des sessions (heure d'ouverture des portes, heure du show) avec un nombre de sessions configurable.

---

## Navigation

Le footer propose les boutons `Previous` / `Next` persistants. Le bouton `Next` est conditionné différemment selon l'étape :

| Étape | Condition de passage |
|---|---|
| Map Space | `selectedSpace` non nul |
| Map Shops | Libre (aucune validation forcée) |
| Menu Mapping | Libre |
| Process Timeline | `eventTimelineMessage` commence par « All » |
| Synchronize Data | Remplacé par « Complete & Close » une fois la synchronisation terminée |
| Finalizing Data | Pas de bouton Next — fermeture automatique |
