# Live events — gestion temps réel (conception)

> **Statut : 🔵 À construire — aucun code n'existe encore.** Contrairement aux autres pages de ce
> dossier, cette page ne peut pas être « vérifiée contre le code réel » puisque le module n'est pas
> écrit : c'est une **conception**. Elle décrit *ce qu'il faut bâtir* et *où ça se branche* sur
> l'existant, et sera convertie en cartographie vérifiée une fois le module livré.
>
> Domaine cartographie : **Live events** (nouveau). Owners pressentis : **Ulrich** (backend temps réel,
> agrégation, spaces) + **Jean-Luc** (écrans Analyse & Inventory réutilisés). **Hors domaine Auth/RBAC
> (Emmanuel)** — le gating RBAC est un simple branchement (voir §9).
> Source : maquettes fournies le 2026-07-20 (2 captures : bouton Live sur la Home + entrée Tools).
> Rédigé le 2026-07-20.

---

## 1. Objectif

Quand un événement est **en cours** (des ventes arrivent en direct via **Weezevent** ou **Digifood**),
offrir un mode **Live** : une version *temps réel* de l'écran Analyse existant, qui se rafraîchit seule
pendant l'event, plus un **onglet Inventaire live** (niveaux de stock par shop / par item).

Le Live ne réinvente pas l'analyse — il **branche l'écran Analyse existant sur un flux** au lieu d'un
chargement ponctuel « All history ».

## 2. Points d'entrée UX (2)

1. **Carte d'espace sur la Home** (`/spaces`, `src/components/spaces/widgets/SpaceItem.vue`) : un bouton
   **◉ (rouge, « record »)** apparaît en haut à droite de la carte, **uniquement si l'espace a un event
   live**. À côté des icônes outils/éditer/supprimer existantes.
2. **Dropdown « Tools »** d'un espace — liste définie dans `src/components/analyse/FilterPanel.vue:32-39`,
   navigation dans `onToolboxSelect()` (`:468`) : ajouter une entrée **« Live »** à la liste actuelle
   (Analyse, Predict, Event Predict, Inventory, Logistic, Restock).
   ⚠️ Doublon connu : `src/components/analyse/filters/FilterPanel.vue` porte la même liste — vérifier
   lequel est réellement importé avant de greffer.

Les deux mènent à la même route Live de l'espace/event (ex. `/spaces/:id/live` — à confirmer, cf. §10).

## 3. Contenu de l'écran Live

Base = l'écran Analyse (`src/components/analyse/AnalyseView.vue`) en mode flux :

- **Timeline temps réel** + **tous les KPI qui se rafraîchissent en direct** : Revenue, Per Cap,
  % Margin, **TX/min (transactions par minute)**, Event Revenue by shop, POS Performance.
- **Onglet Inventaire live** (nouveau) : niveau de stock **par Shop** (dépliable → détail des éléments
  stockables du shop) et **par Item** (dépliable → détail par shop pour chaque item), rafraîchi en direct.

## 4. Découpage front / back — le Live est full-stack, fondation backend

| Couche | Responsabilité | Owner |
|---|---|---|
| **Backend** | Détecter « event live » ; exposer un flux temps réel (revenus/KPI + timeline + stock live) ; agréger l'inventaire par shop/item | Ulrich |
| **Frontend** | Bouton ◉ conditionnel, entrée Tools, route Live, écran Analyse en mode flux + onglet Inventaire live | Jean-Luc |

**Sans le flux backend, le front ne peut rien afficher de live.** La fondation est backend.

## 5. ⚠️ Décision structurante n°1 : le transport temps réel

**Rien n'existe aujourd'hui** — aucun WebSocket/SSE/socket.io dans le repo (vérifié par grep). Trois options :

| Option | Coût | Remarque |
|---|---|---|
| **Polling** (le front re-fetch toutes les N s) | Faible | Réutilise les endpoints REST existants ; l'agrégation est déjà périodique, donc la fraîcheur est de toute façon bornée. **Reco pour un v1.** |
| **SSE** (Server-Sent Events) | Moyen | Flux unidirectionnel serveur→client, simple, suffisant ici (pas d'interaction montante). |
| **WebSocket** | Élevé | Bidirectionnel, overkill pour de l'affichage ; à réserver si besoin d'interactions live. |

👉 **À trancher avec Ulrich avant tout code.** C'est ce choix qui conditionne l'API et l'architecture front.

## 6. Données & endpoints existants à réutiliser (ne pas repartir de zéro)

D'après [02_ANALYSE.md](02_ANALYSE.md) et [06_STOCK_INVENTAIRE.md](06_STOCK_INVENTAIRE.md) :

- **`GET /spaces/:id/event-timeline`** — déjà décrit comme *item-level, temps réel* : **le meilleur point
  d'ancrage** pour la timeline live.
- **`GET /spaces/:id/shop-details`** — shop-level pré-agrégé (KPI par shop / POS Performance).
- Modèles d'agrégats : `SpaceRevenueMinuteAgg` (minute × dimension), `SpaceProductRevenueDailyAgg`.
- Source du « live » : webhooks **Weezevent/Digifood** → `IntegrationWebhookEvent` → agrégation (backend
  `IntegrationsModule` + queue d'agrégation).
- Stock : les modèles/endpoints d'inventaire du domaine Stock (par shop/item) — à agréger « live ».

## 7. Contrats API proposés (à valider côté backend)

> Esquisse, non contractuelle — dépend de la décision §5.

- **« Cet espace a-t-il un event live ? »** : signal pour afficher le bouton ◉. Ex. champ `liveEvent`
  sur la liste des spaces, ou `GET /spaces/:id/live-status` (basé sur : dernier webhook reçu < seuil).
- **Flux analytics live** : soit polling de `event-timeline`/`shop-details` avec un paramètre de
  fenêtre, soit un canal SSE `GET /spaces/:id/live/stream`.
- **Inventaire live** : `GET /spaces/:id/live/inventory` → arbre shop → items stockables, avec niveaux.

## 8. Découpage en tâches

**Backend (Ulrich) — fondation**
1. Définir et exposer le signal « event live » (§7).
2. Choisir le transport (§5) et exposer le flux analytics.
3. Exposer l'agrégat inventaire live par shop/item.

**Frontend (Emmanuel) — consommation** (points d'insertion vérifiés le 2026-07-20)
4. Bouton ◉ conditionnel dans `SpaceItem.vue` (nouveau, hors `.si-actions` qui est hover-only ; affiché
   si `space.liveEvent`) → `router.push('/spaces/:id/live')`.
5. Entrée « Live » dans `FilterPanel.vue:32-39` + `onToolboxSelect():468` (+ `livePath` computed) ; route
   enfant `space-live` dans `router/index.js` après `space-restock` (`meta.permission`).
6. Mode flux de `AnalyseView.vue` : relancer les loaders existants (`useAnalyseTimeline:529`,
   `useAnalyseItemRecords:549`, `useSpaceData`) sur un intervalle + badge « ● LIVE » ; nettoyer à l'unmount.
7. Onglet Inventaire live (seule nouvelle UI) : réutiliser `useInventoryData.js` + arbre shop/item dépliable.

## 8bis. Points d'insertion front — vérifiés contre le code le 2026-07-20

> Poids : 🟢 léger (greffe) · 🟡 moyen · 🔴 nouvelle UI à construire.

| # | Greffe | Fichier & ancrage | Nature | Poids | Prérequis backend |
|---|---|---|---|---|---|
| A | Bouton ◉ live | `SpaceItem.vue` — nouvel élément dans `.si-img`, **hors** `.si-actions` (hover-only, `:14-24`) ; `v-if="space?.liveEvent"` → `router.push('/spaces/:id/live')` | Ajout | 🟢 | champ `liveEvent`/`isLive` sur le payload liste d'espaces |
| B | Entrée « Live » dans Tools | `analyse/FilterPanel.vue` — liste `:32-39`, handler `onToolboxSelect():468`, + `livePath` computed (près de `restockPath:456`) | Ajout | 🟢 | — |
| C | Route `space-live` | `router/index.js` — route enfant après `space-restock` (`:184`), `meta:{ permission, keepAlive }` ; guard permission déjà en place (`:460`) | Ajout | 🟢 | code de permission (voir §9) |
| D | Mode « flux » de l'Analyse | `analyse/AnalyseView.vue` — relancer `useAnalyseTimeline:529` / `useAnalyseItemRecords:549` / `useSpaceData` sur intervalle + badge « ● LIVE », nettoyage à l'unmount | Modif comportement | 🟡 | endpoint(s) de flux ou cible de polling |
| E | Onglet Inventaire live | nouveau composant — réutilise `useInventoryData.js`, arbre dépliable Shop → items / Item → shops | **Nouvelle UI** | 🔴 | agrégat inventaire live par shop/item |

⚠️ **Dette préalable (greffe B)** : le fichier `analyse/FilterPanel.vue` a un **doublon**
`analyse/filters/FilterPanel.vue` portant la même liste d'outils. Identifier lequel `AnalyseView.vue`
importe réellement **avant** de greffer, sinon l'entrée n'apparaît qu'à moitié.

### Prérequis backend bloquants (sans eux, A / D / E n'affichent rien)

1. **Signal « event live »** exposé sur la liste d'espaces (champ) et/ou `GET /spaces/:id/live-status`.
2. **Flux analytics live** — transport à trancher (§5) : polling des endpoints existants, ou canal dédié.
3. **Agrégat inventaire live** par shop/item.

## 9. Ownership & RBAC (branchement, pas un chantier)

- Module **hors Auth/RBAC** : côté gating, il suffit d'exposer la route/entrée Tools derrière un code
  de permission existant (probablement `front.fb.analyse` ou un nouveau `front.fb.live` à cataloguer) —
  à décider avec le catalogue RBAC. Voir [../utiles/RBAC_SYSTEM.md](../utiles/RBAC_SYSTEM.md).
- **Assignation à trancher par le lead.** Backend = Ulrich (non contesté). Front : les écrans Analyse &
  Inventory réutilisés sont historiquement le domaine de **Jean-Luc**, mais **Emmanuel** s'est positionné
  sur la partie front (cf. §8). Cette greffe touchant `AnalyseView`/`SpaceInventoryView`, l'ownership
  front doit être acté nommément avant de démarrer — pas décidé unilatéralement.

## 10. Zones grises — à trancher avant code

1. **Transport temps réel** : polling vs SSE vs WebSocket (§5) — bloquant.
2. **Définition de « event live »** : quel signal exact (dernier webhook < N min ? statut d'event ?) ?
3. **Route** : `/spaces/:id/live` dédiée, ou paramètre `?live=1` sur l'écran Analyse ?
4. **Inventaire live** : d'où vient le stock « en direct » (mouvements Restock ? décrément par vente) ?
5. **Un seul event live par espace** à un instant T, ou plusieurs ?

> Portées à l'arbitrage dans [../QUESTIONS_A_BERTRAND.md](../QUESTIONS_A_BERTRAND.md) — **questions #19 à #23**
> (statut 🔴). Ne pas démarrer le code tant qu'elles ne sont pas tranchées.

## 11. Phasage proposé

> Indicatif — à confirmer une fois le transport (§5) tranché.

- **v1 — « Live analytics » (le minimum utile)** : signal event-live (backend) + bouton ◉ (A) + entrée
  Tools & route (B, C) + mode flux de l'Analyse par **polling** (D). Livre l'écran live sans nouvelle UI
  lourde. C'est le socle démontrable.
- **v2 — « Live inventory »** : agrégat inventaire live (backend) + onglet arbre shop/item (E). La seule
  vraie nouvelle interface ; peut suivre v1 sans le bloquer.
- **v3 (optionnel)** : passage du polling à SSE/WebSocket si la fraîcheur du polling s'avère insuffisante.

## 12. À valider par le lead avant démarrage

> Le module ne démarre pas tant que ces points ne sont pas actés. Rien n'est implémenté à ce stade.

- [ ] **Transport temps réel** (§5) — reco : polling pour v1.
- [ ] **Définition de « event live »** (§10.2) — quel signal backend précis.
- [ ] **Forme de la route** (§10.3) — `/spaces/:id/live` dédiée vs `?live=1` sur l'Analyse.
- [ ] **Source du stock live** (§10.4) et périmètre de l'onglet inventaire.
- [ ] **Un ou plusieurs events live** par espace (§10.5).
- [ ] **Permission RBAC** de la route (§9) — réutiliser `front.fb.analyse` ou créer `front.fb.live`
      (si nouveau : seed catalogue + backfill — cf. tâches RBAC).
- [ ] **Ownership front** (§9) — Jean-Luc vs Emmanuel, à acter nommément.
- [ ] **Phasage** (§11) — v1 analytics d'abord, v2 inventaire.

---

### Révisions

- **2026-07-20** — Création (conception initiale d'après maquettes). Points d'insertion front vérifiés
  contre le code réel (§8bis) ; §2/§8 corrigés (`FilterPanel.vue`, pas `navigation.js`).
