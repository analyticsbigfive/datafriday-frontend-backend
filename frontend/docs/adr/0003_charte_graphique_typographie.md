# ADR-0003 — Adopter une charte graphique typographique unique (1 police UI + 1 police technique)

- **Statut** : Accepté
- **Date** : 2026-07-15
- **Domaine** : Architecture technique (transverse, convention front)

## Contexte

Un audit du code réel (2026-07-15) a montré une dérive typographique importante : 26
déclarations `font-family` contradictoires dans 15 fichiers (stack Tailwind résiduel du portage
React vs stack système vs Roboto chargé mais jamais réellement forcé), 90 valeurs distinctes de
`font-size` sur 2126 déclarations, et 7 valeurs de `font-weight` dont deux (`650`, `750`) sans
équivalent dans les classes utilitaires Vuetify. Même les pages désignées comme référence par
l'utilisateur ne sont pas homogènes en interne (détail dans `CHARTE_GRAPHIQUE.md` §1).

L'utilisateur a demandé explicitement : 1 à 2 polices maximum pour tout le projet, en prenant
`MarketPriceListView.vue` comme référence pour les pages hors module Analyse et
`EventPredictView.vue` comme référence pour les pages du module Analyse (plus dense en
information, tolère des paliers de taille plus petits).

## Décision

Adopter la charte détaillée dans [`../CHARTE_GRAPHIQUE.md`](../CHARTE_GRAPHIQUE.md) : une police
d'interface unique (stack système natif, déjà celui qui gagne la cascade aujourd'hui) + une
police technique secondaire (monospace, réservée aux affichages terminal/logs) ; une échelle
fermée de 7 paliers de taille en rem ; 4 poids de police (400/500/600/700).

## Conséquences

- Tout nouveau code (page, composant) doit respecter la charte — voir la checklist
  `CHARTE_GRAPHIQUE.md` §6.
- Aucun refactor rétroactif des pages existantes n'est déclenché par cette décision : la
  migration est opportuniste (au fil des retouches), pas un chantier big-bang. Un chantier de
  migration dédié reste possible mais doit être scopé et validé séparément.
- Deux incohérences de chargement de police restent identifiées mais non corrigées par ce ADR
  (retrait du reset Tailwind résiduel d'`index.css`, sort de `webfontloader`/Roboto) — ce sont des
  changements de code, à valider explicitement avant de les faire.

## Références

- [`../CHARTE_GRAPHIQUE.md`](../CHARTE_GRAPHIQUE.md)
- [`../FRONTEND_ARCHITECTURE.md`](../FRONTEND_ARCHITECTURE.md) §7 Styles
