# Charte graphique — typographie (`datafriday-web`)

> Établie le 2026-07-15 à partir d'un audit du code réel + décision explicite de l'utilisateur :
> 1-2 polices max pour tout le projet, [`MarketPriceListView.vue`](../src/components/menu-fb/views/market-prices/views/MarketPriceListView.vue)
> comme référence pour les pages **hors module Analyse**, `EventPredictView.vue` (rendu par
> [`SpacePredictView.vue`](../src/views/SpacePredictView.vue)) comme référence pour les pages **du
> module Analyse**. Décision actée : [ADR-0003](adr/0003_charte_graphique_typographie.md).
> Complète [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) §7 (Styles).

## 1. Constat (audit du 2026-07-15)

- **font-family** : 26 déclarations dans 15 fichiers, stacks contradictoires en cascade —
  `src/index.css:243,281` (reset Tailwind résiduel du portage React) vs `src/style.css:11`
  (stack système, celui qui gagne réellement aujourd'hui) vs `src/plugins/webfontloader.js`
  (charge Roboto 100-900 sans jamais être réellement forcé en `font-family`).
- **font-size** : 2126 déclarations, **90 valeurs distinctes** (px de 8 à 50, rem de 0.6 à 2.1,
  avec incohérences d'écriture — `.8rem` vs `0.8rem` pour la même valeur).
- **font-weight** : `400, 500, 600, 650, 700, 750, 800` + `bolder`/`inherit`/`initial`/`var(...)`
  — les poids `650`/`750` n'ont pas d'équivalent dans les classes utilitaires Vuetify.
- Même les deux pages choisies comme référence ne sont pas homogènes ni en interne ni entre elles
  (Market Price List : 6 tailles/4 poids en comptant ses enfants directs ; Event Predict : 24
  tailles/6 poids sur un fichier monolithe de 9192 lignes). **Cette charte n'entérine donc pas
  leur état actuel tel quel — elle en extrait une échelle rationalisée.**

## 2. Police — décision

- **Police unique d'interface** : le stack système natif déjà gagnant dans la cascade
  aujourd'hui (`src/style.css:11`) :
  `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`.
  Aucun webfont à charger : rendu natif immédiat, pas de flash de police, cohérent avec ce que
  l'utilisateur voit déjà.
- **Police secondaire (technique uniquement)** : stack monospace système
  (`ui-monospace, 'Courier New', monospace`), réservée aux affichages terminal/logs/traces
  d'exécution (ex. `AlgoTraceTerminal.vue`). Jamais pour un libellé, un tableau de données ou du
  texte UI normal.
- **Dette identifiée, pas traitée dans cette passe** (ce sont des changements de code, pas de
  doc — à valider séparément avant de les faire) :
  - `src/index.css:243,281` entre en conflit de cascade avec `style.css` — à retirer pour ne
    plus dépendre de l'ordre d'import.
  - `src/plugins/webfontloader.js` télécharge Roboto sur 6 graisses sans jamais être forcé en
    `font-family` — à retirer, ou à assumer comme police forcée, mais pas laisser les deux
    coexister en contradiction.

## 3. Échelle de tailles — décision

Un seul système de paliers en **rem** (jamais en px pour du nouveau code — accessibilité zoom
navigateur, et ça élimine l'incohérence d'écriture actuelle). Deux usages du même système :

| Palier | Taille | Usage | Où l'utiliser |
|---|---|---|---|
| `xs` | 0.6875rem (11px) | micro-labels, badges | Analyse uniquement |
| `sm` | 0.75rem (12px) | texte secondaire, cellules de tableau dense | Analyse + tableaux denses hors Analyse (ex. `MarketPriceTable.vue`) |
| `base` | 0.8125rem (13px) | corps de texte par défaut | Toutes pages |
| `md` | 0.875rem (14px) | corps de texte standard, boutons, champs de formulaire | Toutes pages |
| `lg` | 1rem (16px) | sous-titres, valeurs mises en avant | Toutes pages |
| `xl` | 1.25rem (20px) | titre de section | Toutes pages |
| `xxl` | 1.5rem (24px) | titre de page | Toutes pages, avec parcimonie |

Pas de valeur en dehors de ces 7 paliers pour du nouveau code, en px ou en rem.

## 4. Poids de police — décision

4 poids seulement : `400` (regular, texte courant), `500` (medium, libellés/emphase légère),
`600` (semibold, sous-titres/valeurs clés), `700` (bold, titres).

Remap des poids ad hoc trouvés dans l'audit : `650` → `600`, `750` → `700`, `800` → `700`.
`bolder`/`inherit`/`initial`/`var(...)` : à évaluer au cas par cas quand le fichier concerné est
de toute façon retouché, pas de traitement en masse ici.

## 5. Portée de cette charte

- S'applique **immédiatement** à tout nouveau code (nouvelle page, nouveau composant).
- Ne déclenche **pas** de refactor rétroactif des pages existantes dans cette passe — l'audit a
  identifié ~90 valeurs de taille sur 15+ fichiers pour `font-family` seul ; une réécriture en
  masse est un chantier à part entière (risque de régression visuelle, test navigateur
  systématique par page requis, cf. `CONTRIBUTING.md`).
- **Migration recommandée : opportuniste.** Quand une page/un composant est retouché pour une
  autre raison, aligner sa typo sur cette charte au passage plutôt que la laisser telle quelle.
- Un chantier de migration dédié (par domaine, en commençant par les pages les plus visibles) est
  possible mais doit être scopé et validé explicitement séparément — ce n'est pas fait ici.

## 6. Checklist pour un agent qui écrit du CSS

1. Nouveau texte ? → un des 4 poids (`400/500/600/700`), jamais `650/750/800`.
2. Nouvelle taille ? → un des 7 paliers rem de la table §3, jamais une valeur px ou une valeur
   rem hors table.
3. Nouvelle police ? → aucune à déclarer, on hérite du stack global — sauf affichage
   terminal/logs → stack monospace (§2).
4. Page du module Analyse ? → `xs`/`sm` autorisés en plus des autres paliers. Page hors Analyse ?
   → éviter `xs`, `sm` réservé aux tableaux denses (type `MarketPriceTable.vue`).

## Références

- [ADR-0003](adr/0003_charte_graphique_typographie.md)
- [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) §7 Styles
