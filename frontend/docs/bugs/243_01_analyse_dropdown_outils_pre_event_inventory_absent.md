# BUG-243-01 — Analyse : « Pre-event Inventory » absent du dropdown Outils (et « Post-event » affiché « Inventory »)

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (écran Pre-event Inventory inaccessible depuis Analyse, qui est la page
  d'atterrissage par défaut d'un espace)
- **Domaine** : Stock / navigation inter-écrans (dropdown « Outils »)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-29 · **Corrigé le** : 2026-07-29 (JLH)
- **Fichiers** : [`src/components/analyse/filters/FilterPanel.vue:616-625`](../../src/components/analyse/filters/FilterPanel.vue),
  [`src/i18n/translations.js:1495`](../../src/i18n/translations.js) (en) et `:5260` (fr)

## Symptôme

Le dropdown « Outils » (colonne gauche) n'affiche pas les mêmes entrées selon l'écran où on se
trouve :

| Écran | Entrées inventaire affichées |
|---|---|
| Inventory / Logistic / Restock / Event Predict | **Pre-event Inventory** + **Post-event Inventory** |
| **Analyse** | une seule entrée, **« Inventory »** |

Conséquences concrètes :

1. **L'écran Pre-event Inventory (`/spaces/:spaceId/pre-inventory`) n'est pas atteignable depuis
   Analyse.** Or `space-analyse` est la vue par défaut d'un espace
   ([router/index.js:139-147](../../src/router/index.js), `spaceEntryGuard`) : un utilisateur qui
   arrive sur son espace doit passer par Inventory/Logistic/Restock pour trouver le Pre-event, ou
   taper l'URL à la main.
2. L'entrée restante s'appelle « Inventory » / « Inventaire » alors qu'elle route vers le
   **Post-event** (`/spaces/:spaceId/inventory`). Libellé ambigu depuis l'ajout du Pre-event
   (2026-07-20, cf. [`modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) § 8) :
   rien n'indique laquelle des deux phases on ouvre.

## Cause racine

**Oubli d'une ligne dans le tableau d'items — toute la plomberie de navigation était déjà là.**

Le dropdown d'Analyse est alimenté par `toolboxItems`
([FilterPanel.vue:616](../../src/components/analyse/filters/FilterPanel.vue)), qui listait 7 entrées
sans `space-pre-inventory`. Pourtant, dans le **même fichier** :

- `spacePreInventoryPath` (`:570`) construisait déjà `/spaces/:spaceId/pre-inventory` ;
- `onToolboxSelect` (`:591`) traitait déjà la valeur `'space-pre-inventory'` et faisait le
  `router.push`.

Cette branche était donc **du code mort** : aucune entrée du dropdown ne pouvait émettre cette
valeur. Le Pre-event a été câblé dans le handler et le path, mais jamais ajouté à la liste rendue.

Deuxième cause, cosmétique : la clé i18n `anToolInventory` valait `'Inventory'` / `'Inventaire'`,
seule survivante d'avant la scission pre/post. Ses 4 homologues sur les autres écrans valaient déjà
`'Post-event Inventory'` (`invToolInventory`, `epToolSpaceInventory`, `srToolSpaceInventory`).

### Pourquoi ça a divergé : 5 copies de la même liste

La liste d'outils est **dupliquée dans 5 fichiers**, sans source commune (seul le composant de rendu
[`WorkspaceToolSelect.vue`](../../src/components/WorkspaceToolSelect.vue) est partagé — c'est un
`v-select` bête, il ne filtre ni ne complète rien) :

| Fichier | Symbole | Avait le Pre-event ? | Filtre par permission ? | A « Live » ? |
|---|---|---|---|---|
| [`analyse/filters/FilterPanel.vue:616`](../../src/components/analyse/filters/FilterPanel.vue) | `toolboxItems` | ❌ (ce bug) | ❌ | ✅ |
| [`EventPredictView.vue:1256`](../../src/components/EventPredictView.vue) | `TOOLBOX_ITEMS` | ✅ | ✅ | ❌ |
| [`SpaceInventoryView.vue:702`](../../src/views/SpaceInventoryView.vue) | `TOOLBOX_ITEMS` | ✅ | ✅ | ❌ |
| [`SpaceRestockView.vue:1061`](../../src/views/SpaceRestockView.vue) | `TOOLBOX_ITEMS` | ✅ | ✅ | ❌ |
| [`SpaceLogisticView.vue:439`](../../src/views/SpaceLogisticView.vue) | `TOOLBOX_ITEMS` | ✅ | ✅ | ❌ |

Ajouter un outil demande donc 5 modifications ; en oublier une passe inaperçue. `SpaceLogisticView`
signale d'ailleurs sa propre copie en commentaire (« Miroir de `TOOLBOX_ITEMS`
(SpaceRestockView.vue) ») — le problème était connu mais non traité.

Deux différences de contrat entre la copie d'Analyse et les 4 autres, à connaître avant d'y toucher :

- Analyse pose un **`label:` déjà résolu** (`label: t('...')`, consommé par `item-title="label"`) ;
  les 4 autres posent un `labelKey:` traduit dans un computed. Poser un `labelKey` côté Analyse
  affiche une ligne **vide sans aucune erreur**.
- Analyse ne porte **pas** de champ `permission` et ne filtre pas (voir « à surveiller »).

## Correction

1. [`FilterPanel.vue:621`](../../src/components/analyse/filters/FilterPanel.vue) — entrée ajoutée
   juste avant le Post-event, même valeur / même icône que sur les 4 autres écrans :

   ```js
   { value: 'space-pre-inventory', label: t('invToolPreInventory'), icon: 'mdi-clipboard-arrow-up-outline' },
   ```

   Réutilisation de la clé `invToolPreInventory` plutôt que création d'un `anToolPreInventory` :
   c'est déjà ce que font `EventPredictView`, `SpaceRestockView` et `SpaceLogisticView`, qui
   pointent tous cette même clé `inv*`. Rend du même coup atteignable la branche
   `onToolboxSelect` (`:591`), jusqu'ici morte.

2. [`translations.js`](../../src/i18n/translations.js) — `anToolInventory` :
   `'Inventory'` → `'Post-event Inventory'` (en, `:1495`), `'Inventaire'` →
   `'Inventaire post-événement'` (fr, `:5260`). Seul consommateur de cette clé : la ligne 622 de
   `FilterPanel.vue` — aucun autre écran impacté. Les 5 dropdowns affichent désormais les mêmes
   libellés.

Aucune modification de route, de guard ni de backend : les deux routes
(`space-inventory` / `space-pre-inventory`) existaient déjà
([router/index.js:166-181](../../src/router/index.js)).

## Risque de régression / à surveiller

- **Non vérifié en navigateur** (pas de `pnpm dev` dans cette session) : ouvrir Analyse, dérouler
  « Outils », confirmer 8 entrées dont Pre-event **et** Post-event, et que chacune atterrit sur la
  bonne URL (`/pre-inventory` vs `/inventory`). Sur l'écran d'arrivée, la valeur sélectionnée doit
  refléter la phase — c'est déjà géré par `isPreMode`
  ([SpaceInventoryView.vue:73 et 521](../../src/views/SpaceInventoryView.vue)), vérifié par lecture.
- **Le dropdown d'Analyse ne filtre toujours pas par permission** (contrairement aux 4 autres, qui
  passent par `auth/can` — ex. [SpaceInventoryView.vue:824-834](../../src/views/SpaceInventoryView.vue)).
  Un utilisateur sans `front.fb.spaceInventory` voit donc Pre-event **et** Post-event, comme il
  voyait déjà Post-event, Logistic et Réarmement avant ce fix : ce n'est **pas une régression**
  introduite ici, mais un écart réel, laissé tel quel volontairement (le corriger change ce que
  voient les utilisateurs restreints — à arbitrer séparément).
- Sur la capture d'origine, le menu d'Analyse s'arrêtait visuellement à « Logistic » alors que le
  tableau définit aussi « Restock » en dernier et ne filtre rien : très probablement un simple
  rognage / défilement de la capture, non investigué.
- **« Live » n'existe que dans la liste d'Analyse** : depuis Inventory/Logistic/Restock/Event
  Predict, on ne peut pas rejoindre `/spaces/:spaceId/live` par le dropdown. Divergence symétrique
  de celle-ci, **non corrigée ici** (voir ci-dessous).
- **Piège pour la prochaine intervention** : `src/components/analyse/FilterPanel.vue` (sans
  `filters/`) est un **doublon mort** — importé nulle part, `AnalyseView` monte
  [`./filters/FilterPanel.vue`](../../src/components/analyse/AnalyseView.vue) (`:443`). Un grep sur
  `anTool` remonte les deux : éditer le mauvais donne un fix sans effet visible.
- **Dette de fond** : tant que les 5 copies existent, la prochaine entrée d'outil rejouera ce bug.
  Candidat à une extraction en module unique (ex. `src/constants/toolboxItems.js`) exposant
  `value`/`labelKey`/`icon`/`permission` + la résolution de chemin, consommé par les 5 écrans —
  chantier séparé, non fait ici.

## Références

- [`modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) § 8 — Pre-event
  Inventory, écran bi-mode piloté par `route.meta.inventoryMode`.
- [`router/index.js:166-181`](../../src/router/index.js) — les deux routes et leur `inventoryMode`.
- [BUG-237](237_post_event_prerempli_par_comptage_pre_event.md) — autre confusion pre/post, côté
  données (comptage) et non navigation.

---

JLH
