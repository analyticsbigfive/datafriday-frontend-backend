# BUG-281-01 — Builder2 : inspecteur (panneau droit) et dialogs restés clairs en dark mode — vague dédiée annoncée par BUG-247-01

- **Statut** : 🟡 Corrigé non déployé (corrigé en code le 2026-08-02, non buildé/testé)
- **Sévérité** : 🟡 Mineur (panneaux blancs empilés dans la colonne sombre, champs de recherche invisibles)
- **Domaine** : Espaces & builder / Thème
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-02 (audit dark mode complet ; dette déclarée « vague dédiée » dans BUG-247-01) — JLH
- **Fichiers** : `src/components/spaces/views/builder2/components/inspector/sections/{StorageInventorySection,InventorySection,StaffSection,StorageShopsSection}.vue`,
  `.../inspector/InspectorPanel.vue`, `.../builder2/dialogs/{DeleteConfigDialog,DeleteElementDialog,DeleteZoneDialog,ZoneEditDialog}.vue`

## Symptôme

Route `/spaces/:id/builder2`, thème sombre : les 4 sections non migrées de l'inspecteur
(inventaire storage/shop, staff, storages↔shops) affichent cartes `#fafafa`/`#f4f4f5`, champs
blancs et labels `#374151` dans la colonne droite sombre ; champs de recherche invisibles.
Dialogs (suppression config/élément/zone, édition zone) : puce d'avertissement ambre `#8a5200`
illisible sur chip sombre, labels `#6c757d`, encadré trous en `rgba(0,0,0,.03)` (teinte
invisible sur sombre).

## Cause racine

La migration du shell Builder2 vers `rgb(var(--v-theme-*))` (BuilderWorkspace, GeometrySection,
StaffingInputsSection…) n'a jamais atteint ces 4 sections (0 variable thème, 10 à 32 littéraux
clairs chacune) ni les dialogs téléportés (hors `.v-application`, où `rgb(var(...))` serait de
toute façon invalide sans repli — piège BUG-237-02).

## Correction

Corrigé le 2026-08-02, conventions des sections déjà migrées :

- Blancs purs `#fff` → `rgb(var(--v-theme-surface))` (valeur claire identique) — sections
  uniquement (dans `.v-application`).
- Gris clairs sans équivalent thème exact : littéral clair conservé + bloc `.dark` en fin de
  `<style scoped>` (fonds `#111827`/`#1a2332`/`#1f2937`, textes `#d1d5db`/`#94a3b8`, bordures
  `#374151`/`rgba(255,255,255,.1-.14)`). Chaque `:hover`/`:focus` clair d'égale spécificité a
  son re-assert `.dark ... :hover/:focus` (piège d'ordre de source).
- Accents foncés → membre clair de la famille : `#2563eb→#93c5fd` (dupliquer), `#8a5200→#fcd34d`
  (puce blockers ×3 dialogs), `#b45309→#fbbf24` (badge storage), `#6c757d→#94a3b8`. `#ff3131`
  intact. `InspectorPanel.vue` : `:color="'#111827'"` inline (icône upload, non surchargeable en
  CSS) sorti en classe `.ip-act--upload` + override `.dark`.
- `ZoneEditDialog` : teintes `rgba(0,0,0,…)` → `rgba(255,255,255,…)` en sombre.

Choix assumé (documenté, pas un oubli) : les ~15 textes muted `#9ca3af` (gray-400, mi-échelle)
restent partagés entre les deux thèmes — lisibles sur les deux familles de fonds ; idem jauge
`#10b981`.

## Risque de régression / à surveiller

- Mode clair : seuls les `#fff` ont changé de source (`--v-theme-surface` = `#FFFFFF` en clair,
  rendu identique) — vérifier visuellement les 4 sections en clair quand même.
- Sombre : contrôler chevron SVG data-URI des selects Staff (fond passé `background-color` pour
  le préserver), hero image de l'InspectorPanel (`.ip-header--image .ip-act` doit rester blanc
  par-dessus l'image dans les 2 thèmes).

## Références

- [BUG-247-01](247_01_darkmode_cartes_espaces_homepage.md) — y était déclaré « vague dédiée ».
- [BUG-237-02](237_02_csvimportdrawer_darkmode_menu_select_teleporte_illisible.md) — piège
  `rgb(var())` hors `.v-application`.
