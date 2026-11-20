# Recette navigateur : outil Forecast / Prévision (ex-Predict d'Analyse)

> Pour Ulrich. À dérouler dans le navigateur sur la branche `develop` (commits `25fe1f05` à
> `af1c8d79`, 2026-11-20). Règles et fichiers : section « Outil Forecast / Prévision » de
> [`../modules/02_ANALYSE.md`](../modules/02_ANALYSE.md). Points à valider par Bertrand :
> question #93 de [`../QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md).
>
> Date de la recette : ____ / Testeur : ____ / Espace testé : ____

## Préparation

- [ ] Compte avec la permission `front.fb.predict` (sinon l'outil n'apparaît pas).
- [ ] Un espace qui a des events passés ET au moins un event futur avec un **scénario Event Predict
      sauvegardé** (sans lui, les modifications de prix n'ont rien à modifier : c'est la limite
      attendue, voir point 7). Idéalement aussi un event futur sans scénario.
- [ ] Tester d'abord en français, puis rebasculer en anglais pour les points 1 et 7.
- [ ] Ouvrir l'onglet Réseau des outils de développement (point 2).

## 1. Renommage

- [ ] Menu d'outils d'Analyse : « Prévision » (FR) / « Forecast » (EN), plus « Prédire » ni « Predict ».
- [ ] Même libellé dans le menu d'outils d'Inventaire, de Réarmement et d'Event Predict.
- [ ] Titre du bouton de navigation principale (`MainNav`) : « Prévision ».
- [ ] Chargement de l'outil : « Chargement Prévision… » (FR) / « Loading Forecast… » (EN).
- [ ] **La page Event Predict garde son nom** : en-tête « Préd. Événement » (FR) / « Event Predict »
      (EN), chargement de route « Chargement Event Predict… ». Elle fonctionne comme avant
      (ouverture, scénarios, sauvegarde).
- [ ] Export de l'Analyse en Prévision : nom de fichier terminé par `-forecast` (plus `-predict`),
      libellé de mode « Prévision » / « Forecast ».

## 2. Ouverture du drawer en Prévision

- [ ] En Prévision, le bouton **Comparaison** est visible (comme en Analyse, hors Live).
- [ ] Il ouvre le formulaire « Modifications Forecast » (et non le formulaire de comparaison
      classique avec périodes et events).
- [ ] Le menu « Type de modification » propose 6 entrées : Prix TTC d'un Menu Item, Prix d'une
      catégorie, Prix d'un type, Taux de transformation, Percap, Panier moyen.
- [ ] Réseau : ouvrir le drawer puis appliquer des modifications ne déclenche **aucune requête de
      comparaison** (pas de nouvel `event-timeline` ni `shop-details`), le calcul est local.

## 3. Chaque type de modification

Pour chacun : choisir le type, régler, « Ajouter » (la ligne apparaît dans « Modifications
ajoutées »), « Appliquer les modifications », lire le rapport de comparaison.

- [ ] **Prix TTC d'un Menu Item** : choisir un Menu Item, saisir un nouveau prix. Le HT dérivé
      s'affiche (« Soit ... HT »). Un prix négatif est refusé ; un article sans prix catalogue est
      signalé (« prix catalogue manquant »). Après application : CA de l'article x (nouveau TTC /
      TTC catalogue), **quantités inchangées** (pas d'élasticité).
- [ ] **Prix d'une catégorie** : choisir une catégorie, curseur en % de -100 à +100, valeur
      résultante affichée. Le CA des articles de la catégorie varie du même %, quantités inchangées.
- [ ] **Prix d'un type** : idem avec un type.
- [ ] **Taux de transformation** +10 % : quantités, CA **et** transactions du comparé à +10 %.
- [ ] **Percap, mode « Plus de monde achète »** +10 % : même effet que la transformation
      (quantités, CA, transactions).
- [ ] **Percap, mode « Panier plus gros »** +10 % : CA +10 %, **quantités et transactions
      inchangées**.
- [ ] **Panier moyen** +10 % : CA +10 %, quantités et transactions inchangées.
- [ ] Les curseurs affichent la valeur résultante quand la valeur de base du rapport est connue
      (par exemple « 12,40 € → 13,64 € ») et seulement le % sinon.
- [ ] Les modifications s'appliquent aux **events passés comme futurs** affichés (le CA d'un event
      passé change dans le comparé).

## 4. « La dernière ajoutée l'emporte »

- [ ] Ajouter Taux de transformation +10 %, puis Taux de transformation +20 % : la liste ne garde
      **qu'une ligne** (+20 %), avec la mention « Remplace la modification précédente ... ».
      Le rapport appliqué reflète +20 %.
- [ ] Même test avec un prix TTC sur le même Menu Item : la dernière valeur gagne.
- [ ] Percap « Plus de monde achète » et Percap « Panier plus gros » sont deux cibles distinctes :
      elles **coexistent** dans la liste.

## 5. Cumul multiplicatif

- [ ] Taux de transformation +10 % **et** Panier moyen +10 % : CA du comparé **+21 %** (1,1 x 1,1),
      quantités +10 %, transactions +10 %.
- [ ] Un prix et une transformation se multiplient aussi (CA = CA x ratio de prix x 1,1).

## 6. Liste vide et écarts nuls

- [ ] Liste vide : « Appliquer les modifications » est grisé. « Tout effacer » vide la liste.
- [ ] Une seule modification à 0 % (curseur au centre), appliquée : **tous les écarts du rapport
      sont à 0**.

## 7. Encart « events sans prévision détaillée »

- [ ] Avec une modification de prix, de catégorie ou de type ET au moins un event sans scénario
      Event Predict : encart « Les modifications de prix, de catégorie et de type ne s'appliquent
      pas à N événement(s) sans prévision détaillée par article. » (EN : « ... do not apply to N
      event(s) without a detailed per-item forecast. »). N correspond au nombre d'events affichés
      sans scénario.
- [ ] L'encart n'apparaît **pas** avec une modification de transformation, de Percap ou de panier
      seule.
- [ ] L'encart n'apparaît pas si tous les events affichés ont un scénario.

## 8. Puces Transactions, Panier moyen, Transformation en Prévision

- [ ] Rapport **principal** en Prévision : les puces Transactions, Panier moyen et Transformation
      sont **affichées** avec des valeurs (elles étaient masquées avant). TX/MIN et valorisation
      du stock restent masquées.
- [ ] Sur un event futur avec scénario : Transactions non nulles et plausibles (de l'ordre de la
      quantité prévue x tickets par unité d'un match comparable).
- [ ] Rapport **comparé** : mêmes puces affichées, valeurs cohérentes avec le principal.
      Transformation +10 % : Transactions +10 %, Panier moyen inchangé, Transformation +10 % en
      relatif. Panier +10 % : Panier moyen +10 %, Transactions inchangées.
- [ ] Panier moyen = CA / Transactions, pour le principal comme pour le comparé.
- [ ] Un event passé affiché avec un scénario : ses transactions suivent l'échelle du scénario (pas
      de tickets réels mélangés à un CA scénarisé).

## 9. Changement d'outil

- [ ] Drawer ouvert, passer à l'outil Analyse : le **drawer se ferme**.
- [ ] Revenir en Prévision : la liste de modifications est **vide** et aucun rapport ancien ne
      s'affiche.
- [ ] Sans changer d'outil, fermer puis rouvrir le drawer : la saisie et la liste sont conservées.
- [ ] Appliquer une comparaison classique en Analyse, passer en Prévision : le drawer montre le
      formulaire de modifications (jamais le rapport de la comparaison classique).

## 10. Export CSV de la comparaison

- [ ] « Exporter en CSV » en Prévision : le fichier se termine par `-forecast`.
- [ ] La table des paramètres contient **une ligne « Modification » par modification** (mêmes
      libellés que dans la liste du formulaire) et **pas de ligne « filtres actifs »**.
- [ ] Les écarts du CSV correspondent à ceux affichés à l'écran.

## 11. Mobile 360 px

- [ ] Le drawer tient en largeur, pas de scroll horizontal, aucun texte coupé.
- [ ] Le pied (« Tout effacer », « Appliquer les modifications ») reste visible en bas.
- [ ] Faire glisser un curseur **ne déclenche pas** le swipe Principal / Comparaison.
- [ ] L'encart du point 7 et la liste des modifications restent lisibles.

## 12. Thème sombre

- [ ] Drawer, curseurs, menus déroulants, liste, encart et rapport lisibles (contraste, pas de
      fond clair résiduel).

## 13. Non-régression : Analyse classique et Event Predict

- [ ] En Analyse, le bouton Comparaison ouvre toujours le formulaire classique, et une comparaison
      (précédent, N-1, période, events) donne les mêmes chiffres qu'avant.
- [ ] En Analyse, aucune ligne « Modification » dans l'export, aucun suffixe `-forecast`, les
      puces sont inchangées.
- [ ] La page Event Predict : scénarios, sauvegarde et comparaison de scénarios inchangés.

## Résultat

- [ ] Recette OK, ou anomalies relevées ci-dessous (point, capture, espace, event) :

  - ...
