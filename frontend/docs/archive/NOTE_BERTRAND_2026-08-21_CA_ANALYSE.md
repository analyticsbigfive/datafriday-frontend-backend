# Pourquoi le chiffre d'affaires n'est pas le même selon l'écran — et ce qu'on change

Note pour **Bertrand** — 2026-08-21.
Détail technique complet : [`bugs/350_01_ca_variable_home_analyse_bascule_source.md`](bugs/350_01_ca_variable_home_analyse_bascule_source.md).

---

## Ce qui a été constaté

Espace **Stade Jean Bouin**, 54 matchs avec ventes.

La carte de l'espace affiche **2 926 565 €**. On ouvre l'Analyse : **2 926 565 €** — le même.
Quelques secondes plus tard, le chiffre tombe à **2 718 041 €**, la marge passe de **100 %** à
**82,5 %**, et la liste des points de vente passe de **42** à **38**. Personne n'a touché à un
filtre.

Il y a en réalité **deux sujets distincts**.

## 1. Entre la carte et l'Analyse, le CA ne bouge pas

C'est le même montant, au centime près. Ce qui diffère, c'est le **« par spectateur »** :
**3,58 €** sur la carte, **6,04 €** sur l'Analyse.

- La carte divise par les billets de **tous** les événements de l'espace — y compris ceux à venir
  et ceux sans vente.
- L'Analyse divise par les billets des **seuls événements affichés**.

Environ 40 % des billets de l'espace sont hors du périmètre de l'Analyse. Les deux calculs sont
défendables ; le problème est qu'ils portent la même étiquette. **On écrit désormais le périmètre
sur chaque tuile.**

## 2. Dans l'Analyse, le chiffre bouge parce que l'écran change de source en cours de route

Au chargement, l'écran affiche un résultat **pré-calculé par point de vente**, disponible tout de
suite. Quand le **détail par article** arrive, il bascule dessus. Trois raisons connues font que
les deux ne donnent pas le même total :

- l'écran n'allait chercher le détail que des **50 premiers événements** ; au-delà, le CA de ces
  matchs ne comptait plus. C'est la cause la plus probable ici — les ordres de grandeur collent
  (4 matchs sur 54 ≈ 7,4 %, écart observé 7,12 %, et 4 points de vente disparus) — mais elle
  **reste à confirmer écran en main** ;
- le calcul détaillé ne retient que les **transactions validées**, l'autre les prend toutes ;
- le calcul pré-calculé **déduit les remises**, le détaillé non.

Ces deux dernières différences sont **volontaires** côté backend et documentées comme telles dans
le code. Ce ne sont pas des bugs — ce sont deux définitions du CA qui coexistent.

**La marge à 100 % n'est pas une marge** : dans le premier état, les lignes ne portent aucune
référence d'article, donc aucun coût ne peut leur être associé. Le calcul rend mécaniquement
100 %. La case ne devrait rien afficher.

## Ce qui n'est pas en cause : le catalogue

Nous avons vérifié **tous** les calculs de chiffre d'affaires : aucun ne passe par les menu items
ni par le space menu. Renommer, déplacer ou supprimer un article ne peut pas faire varier le CA
d'un centime.

Le catalogue n'apporte que trois choses : les **coûts** (donc la marge), les **noms d'articles**,
et la **consommation de stock**. C'est tout.

Le seul réglage qui, lui, peut vraiment faire disparaître du CA, c'est le rattachement d'un
**point de vente à sa caisse** (mapping PdV ↔ location) : démapper un point de vente vide toute la
page Analyse de l'espace.

## Ce qu'on change maintenant

1. L'écran va chercher le détail de **100 événements** au lieu de 50, et **prévient** quand il en
   reste au-delà.
2. **Plus aucune valeur provisoire nulle part.** Tant que le chiffre définitif n'est pas prêt,
   l'écran affiche un chargement — jamais un montant qui va bouger. Cela vaut pour les 4 tuiles,
   la bande du haut, le graphe par point de vente, les camemberts, les tableaux et le panneau
   tx/min.
3. Si le détail ne peut pas être obtenu (panne réseau, points de vente non mappés, date d'un match
   mal saisie), l'écran le **dit explicitement** au lieu d'afficher 0 € ou de tourner
   indéfiniment.
4. La marge affiche **« — »** quand aucun coût n'est connu, au lieu de 100 %.
5. Chaque **« par spectateur »** indique sur quel périmètre il est calculé.

Effet visible et assumé : au premier chargement d'un gros espace, l'écran reste en chargement un
peu plus longtemps qu'avant. C'est le prix de ne plus publier un chiffre faux.

## Deux décisions qui t'appartiennent

1. **Quelle source fait foi pour le CA ?** Le pré-calculé par point de vente, ou le détail par
   article ? Aujourd'hui c'est le détail. Le code est écrit pour que ce choix tienne en **une
   ligne**, à changer sans rien casser.
2. **Le « par spectateur » de la carte d'espace** doit-il rester rapporté aux billets de toute la
   vie de l'espace, ou seulement aux matchs joués avec des ventes ?

## À part, et plus lourd

Sur **8 espaces**, environ **1,26 M€** d'anciens agrégats sont stockés **TTC sous un libellé HT**
(diagnostic BUG-247-01, mesuré au centime près en base le 2026-07-30). Les recalculer est une
opération backend qui fera **baisser tous les montants affichés de 10 à 15 %** — home page, KPI
Analyse, per-capita, CA moyen par événement.

Ce n'est **pas une perte de données** : c'est le hors-taxes qui remplace enfin un TTC mal
étiqueté. Mais sans message préalable, la correction sera lue comme une panne. À planifier et à
annoncer, pas à faire en douce.

---

Rédaction : **JLH**, 2026-08-21.
