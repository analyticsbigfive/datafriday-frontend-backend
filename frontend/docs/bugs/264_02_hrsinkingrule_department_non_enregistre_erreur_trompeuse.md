# BUG-264-02 — Règle Sinking rejetée ("fnbCategory invalide") quand le département vient d'être changé sans enregistrer

<!-- AA = code auteur à 2 chiffres (01 Jean-Luc, 02 Ulrich, 03 Emmanuel) — voir "Comment ajouter un
     bug" dans 00_INDEX.md pour éviter les collisions de numérotation entre branches parallèles. -->

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : RH / Staffing
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-31 (retour utilisateur, capture d'écran : "Off site" sélectionné +
  erreur "fnbCategory invalide : offsite" affichée simultanément)
- **Fichiers** : `frontend/src/components/hr/drawers/HrRoleFormDrawer.vue`

## Symptôme

Dans le tiroir "Edit HR role" : changer le département (ex. vers Merch) SANS cliquer sur le bouton
Save principal, puis ajouter/modifier une règle Sinking en choisissant un sous-type visible à
l'écran (ex. "Off site", valide pour Merch) déclenche une erreur *"fnbCategory invalide : offsite"*
— alors que la valeur choisie est bien dans la liste proposée à l'écran au même moment.

## Cause racine

Régression introduite par la généralisation CFG-2 Étape 4.5 du 2026-07-31 (cf.
[`11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md) §11.13) : `HrService.assertValidSinkingRule()`
valide désormais `fnbCategory` contre le référentiel Subtype **scopé au département du rôle**, en
allant chercher le rôle par `roleId` dans hr.service.ts... mais côté frontend, `saveRuleDraft()`
sauvegarde chaque règle Sinking **immédiatement** (un appel API par changement de champ), alors que
le département affiché à l'écran (`form.department`) n'est qu'un brouillon local tant que le
formulaire principal du rôle n'a pas été sauvegardé. Le backend valide donc contre le département
**encore en base** (l'ancien), pas contre celui affiché à l'écran — mismatch.

Avant cette généralisation, la validation était figée sur `shop` quel que soit le département réel
du rôle : ce problème précis n'existait pas (mais le système acceptait alors des configurations
peu cohérentes pour tout rôle non-`shop`, cf. §11.12/§11.13).

## Correction

La section Sinking Rules se masque désormais tant que `form.department` diffère du département
persisté (`props.initial.department`), remplacée par un message explicite invitant à enregistrer
le rôle d'abord (`hrSinkingRuleSaveDeptFirst`), plutôt que de laisser l'utilisateur atteindre l'état
qui produit l'erreur trompeuse. Nouveau computed `departmentUnsaved`, condition ajoutée à
`showSinkingRules`.

Alternative envisagée et écartée : valider côté frontend contre `form.department` au lieu du
département persisté — rejetée, le backend doit rester la source de vérité (le rôle EN BASE est ce
qui compte réellement pour le calcul de staffing tant que Save n'a pas été cliqué).

## Risque de régression / à surveiller

Aucun — condition strictement additive sur la visibilité d'une section déjà conditionnelle.
Vérifié par parsing SFC/Babel + `pnpm lint:typo` (aucune violation de la charte typographique sur
le fichier modifié).

## Références

- [`11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md) §11.13 (généralisation à l'origine de cette régression)
- [BUG-263-02](263_02_drawer_body_flex_min_height_manquant_contenu_coupe.md) (même écran, corrigé le même tour — refonte visuelle de la section Sinking Rules en cartes étiquetées)
