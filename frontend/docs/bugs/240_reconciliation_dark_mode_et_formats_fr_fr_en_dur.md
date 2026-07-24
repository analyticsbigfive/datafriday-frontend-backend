# BUG-240 — Section et vue Réconciliation : dark mode absent (couleurs en dur) et formats `fr-FR` codés en dur

- **Statut** : 🟡 Corrigé non déployé (2026-07-24, branche `feat/postEventInventory`)
- **Sévérité** : 🟡 Mineur (deux blocs restés clairs au milieu d'un écran sombre ; dates/nombres toujours au format français quelle que soit la langue)
- **Domaine** : Stock — Pre/Post-event Inventory (voir `../modules/10_POST_EVENT_INVENTORY.md` §7.4) × Thème sombre / i18n
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-24 (vérification de l'implémentation Pre/Post-event contre la doc)
- **Fichiers** :
  - `src/components/InventoryReconciliationSection.vue:72-181` (20 littéraux de couleur, **0** `var(--fb-*)`), `:65-69` (`toLocaleDateString('fr-FR')`)
  - `src/components/InventoryReconciliationView.vue:400-473` (24 littéraux, **0** `var(--fb-*)`), `:369`, `:374`, `:387-388` (`toLocaleString`/`toLocaleDateString`/`toLocaleTimeString` en `'fr-FR'`)
  - Référence du contrat : `src/views/SpaceInventoryView.vue:2118-2135` (déclaration `--si-*` ← `--fb-*`), `src/components/InventoryFilterPanel.vue:545-570` (voisin conforme : `var(--fb-surface, #FFFFFF)`)

## Symptôme

En thème sombre, sur `/spaces/:spaceId/inventory` comme `/spaces/:spaceId/pre-inventory` :

- la section **Réconciliation** en bas de la colonne gauche (et sa copie dans le drawer mobile)
  reste une carte **blanche** sous un panneau de filtres sombre ;
- l'ouverture d'un document remplace tout le contenu central par une vue **blanche** (barre, chips,
  table, sous-lignes) au milieu d'un écran sombre.

Indépendamment du thème, en anglais : les dates des documents s'affichent `24/07`, les nombres avec
séparateurs français et le pourcentage suffixé « % » à la française.

## Cause racine

Le dark mode des workspaces F&B repose sur un **contrat de variables** `--fb-*` déclaré sur la
racine de la vue (`.space-inventory-view`, `SpaceInventoryView.vue:2118-2135`), chaque composant
consommant `var(--fb-…, <littéral clair>)` — correctif d'ensemble du 2026-07-24
([BUG-196](196_darkmode_completion_domaines_restants_etoiles_required.md),
[BUG-197](197_darkmode_workspaces_fb_inventory_logistic_restock.md)).

Les deux composants de la réconciliation ont été créés le 2026-07-20, dans la même branche mais
**avant** cette passe, et n'ont jamais été repris : ils écrivent leurs couleurs en littéraux
(`background: #FFFFFF`, `color: #212121`, `border-bottom: 1px solid #F5F5F5`…). Le voisin immédiat
`InventoryFilterPanel.vue:545-570` montre la forme attendue.

Même mécanique pour l'i18n : le projet dispose d'un `useI18n()` maison (utilisé pour tous les
libellés de ces deux composants), mais les helpers de formatage appellent `toLocaleString('fr-FR')`
en dur — l'écart classique du dossier (cf. [BUG-126](126_spacemenus_i18n_formats_en_dur.md),
[BUG-198](198_data_integration_dates_nombres_fr_fr_hardcode.md)).

## Correction

Corrigé le 2026-07-24 :

- Les deux composants passent au contrat `var(--fb-<rôle>, <littéral>)` (surface, subtle, border,
  text, muted, faint) — plus aucun littéral de couleur nu hors fallback. Les couleurs
  **sémantiques** (manquant, surplus, badge « pré ») passent par `--fb-danger` / `--fb-warning` /
  `--fb-*-soft`, déclarés dans les deux thèmes : elles restent lisibles sur fond sombre au lieu
  d'être neutralisées.
- Formats : `useI18n()` fournit la locale, dérivée en `intlLocale` (`en-US` / `fr-FR`) et passée à
  `toLocaleString` / `toLocaleDateString` / `toLocaleTimeString` ainsi qu'à `formatCurrencyDetailed`
  (helper local `formatMoney`).
- Le bandeau de contexte ajouté au passage (fiches 238/241) suit le même contrat.

## Risque de régression / à surveiller

- La section est montée **deux fois** (colonne gauche desktop et `InventoryFilterDrawer` mobile,
  [BUG-236](236_reconciliation_section_inaccessible_mobile.md)) : vérifier le rendu sombre des deux,
  le drawer ayant sa propre racine.
- La vue document est substituée au contenu central : contrôler aussi le fond de la zone
  environnante (`--si-bg`) pour ne pas obtenir une carte sombre sur fond sombre sans séparation.

## Références

- [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) §7.4
- [BUG-197](197_darkmode_workspaces_fb_inventory_logistic_restock.md) (passe dark mode inventory —
  ces deux composants n'y figurent pas), [BUG-121](121_spacemenus_drawers_i18n_darkmode_incomplet.md)
  (même paire de défauts sur un autre domaine)
