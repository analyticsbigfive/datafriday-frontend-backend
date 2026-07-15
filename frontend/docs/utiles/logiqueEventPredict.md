Clarifier et implémenter la logique des sections “Configuration settings” et “Stock up” dans EventPredict.

Objectif général :
Ces deux sections sont liées. “Configuration settings” permet de configurer la prédiction de ventes par shop et par item. “Stock up” utilise ensuite cette prédiction ajustée pour calculer les quantités à approvisionner.

1. Configuration settings

Cette section sert à piloter la prédiction.

Elle doit permettre :
- de voir les shops/PdV concernés par l’event ;
- de sélectionner les menu items actifs pour chaque shop ;
- d’ajuster les quantités prédites ;
- de basculer entre une lecture par shop et une lecture par item.

Deux états doivent être partagés avec le parent EventPredictView :

selectedMenuItems :
- indique quels items sont activés dans chaque shop ;
- structure attendue : shopId → liste ou Set de menuItemIds ;
- si un shop n’a aucun item sélectionné, il est considéré comme fermé.

quantityAdjustments :
- stocke les ajustements de quantité ;
- structure attendue : "shopId-menuItemId" → pourcentage ;
- valeur par défaut : 100 ;
- plage attendue : 0 à 500 %.

2. Source des quantités prédites

Les quantités de base doivent venir des données de prédiction déjà calculées par l’API / timeline prédictive.

Ne pas recalculer ici la pondération des événements passés ni le ratio d’attendance si ces valeurs sont déjà intégrées dans predictedTimelineData.

La section doit seulement :
- retrouver la quantité prédite pour une paire shop + item ;
- sommer les records correspondants si plusieurs lignes existent ;
- appliquer ensuite l’ajustement utilisateur.

Formule :

adjustedQty = round(predictedQty * adjustmentPercent / 100)

3. Matching shop + item

Créer un index de performance à partir de predictedTimelineData.

Clé recommandée :

"shopKey|menuItemId"

Pour retrouver une quantité, tester plusieurs clés possibles côté shop :
- shop.name
- shop.registryId
- shop.id

Cela évite de perdre des données si l’API retourne parfois le nom du shop, parfois son id.

4. Niveaux d’ajustement

La logique d’ajustement fonctionne sur 3 niveaux.

Niveau cellule :
- concerne une paire shop + item ;
- chaque cellule possède son propre pourcentage ;
- si predictedQty > 0, afficher un slider 0–500 % ;
- si predictedQty = 0, permettre une saisie manuelle.

Niveau shop :
- permet d’appliquer un même pourcentage à tous les items sélectionnés d’un shop ;
- lorsqu’on bouge le slider shop, mettre à jour toutes les clés "shopId-menuItemId" du shop concerné ;
- le slider shop doit refléter une valeur commune uniquement si tous les items sélectionnés du shop ont le même pourcentage.

Niveau item :
- permet d’appliquer un même pourcentage à un item sur tous les shops où il est sélectionné ;
- lorsqu’on bouge le slider item, mettre à jour toutes les clés "shopId-menuItemId" concernées ;
- le slider item doit refléter une valeur commune uniquement si cet item a le même pourcentage dans tous les shops concernés.

5. Shop View

La vue “Shop View” organise les données par shop.

Elle doit afficher :
- les onglets Open / Closed ;
- un champ de recherche sur les shops et les items ;
- les shops groupés par type F&B ;
- une card par shop ;
- dans chaque card : les items disponibles, les quantités prédites, les quantités ajustées, les checkboxes de sélection et le slider d’ajustement.

Un shop est “Open” s’il possède au moins un item sélectionné.
Un shop est “Closed” s’il n’a aucun item sélectionné.

Dans chaque shop :
- afficher les items sélectionnés en premier ;
- permettre “Select all menu items” ;
- afficher predictedQty et adjustedQty ;
- permettre de sélectionner ou retirer un item du shop.

6. Item View

La vue “Item View” organise les données par item.

Elle doit afficher :
- les onglets All / Food / Beverage / Combo ;
- un champ de recherche ;
- une card par menu item ;
- pour chaque item, la liste des shops où il est disponible ou vendu ;
- les quantités prédites et ajustées agrégées ;
- le ratio du type “X / Y shops” ;
- le slider d’ajustement global de l’item.

Cette vue ne doit pas créer une autre logique de calcul.
Elle doit lire les mêmes états que Shop View :
- selectedMenuItems ;
- quantityAdjustments.

7. Disponibilité des items

Dans la version Vue, simplifier la logique de disponibilité.

Un item est considéré comme disponible dans un shop s’il existe au moins une donnée correspondante dans les données granulaires actuelles, par exemple shopGranularData ou predictedTimelineData.

Éviter de recréer toute la logique React basée sur :
- ingredients ;
- components ;
- suppliers ;
- supplier.sites.

8. Stock up

La section “Stock up” dépend directement des choix faits dans “Configuration settings”.

Elle ne doit pas recalculer la prédiction depuis zéro.

Elle doit utiliser :
- les shops sélectionnés ;
- les items sélectionnés par shop ;
- les quantités prédites ;
- les ajustements appliqués ;
- les quantités ajustées finales.

Pour chaque shop :
- parcourir les items sélectionnés ;
- récupérer predictedQty ;
- appliquer quantityAdjustments ;
- ignorer les items dont adjustedQty = 0 ;
- générer la liste des produits ou composants à approvisionner.

Formule :

stockQty = round(predictedQty * adjustmentPercent / 100)

9. Expansion des composants

Si les données components / recipes sont disponibles :

- si menuItem.readyForSale = "Yes", garder l’item tel quel en unité pcs ;
- si menuItem.readyForSale = "No", décomposer l’item en composants selon la recette ;
- appliquer les quantités unitaires à la quantité ajustée ;
- agréger les composants identiques par nom + unité ;
- conserver la source pour expliquer d’où vient la quantité.

Si les composants détaillés ne sont pas disponibles en Vue :
- garder le menu item tel quel ;
- unité par défaut : pcs ;
- comportement acceptable : équivalent à un item prêt à vendre.

10. UI Stock up

La section Stock up doit afficher :
- les shops groupés par type F&B ;
- une card pliable par shop ;
- le nombre d’items à approvisionner ;
- pour chaque item/composant : nom, quantité totale, unité et source si disponible.

Les quantités affichées dans Stock up doivent toujours correspondre aux quantités ajustées dans Configuration settings.

11. Règle importante

Configuration settings est la section de paramétrage.
Stock up est la section de conséquence.

Donc :
- si l’utilisateur sélectionne ou désélectionne un item dans Configuration settings, Stock up doit se mettre à jour ;
- si l’utilisateur ajuste une quantité dans Configuration settings, Stock up doit se mettre à jour ;
- Shop View et Item View doivent produire les mêmes résultats, seule la présentation change ;
- Stock up doit toujours refléter l’état courant de selectedMenuItems et quantityAdjustments.

12. Résultat attendu

À la fin :
- les deux sections utilisent les mêmes données sources ;
- les deux sections partagent bien selectedMenuItems et quantityAdjustments via le parent ;
- les quantités ajustées sont cohérentes partout ;
- Shop View affiche les prédictions par shop ;
- Item View affiche les prédictions par item ;
- Stock up affiche les besoins d’approvisionnement calculés à partir des prédictions ajustées ;
- aucune logique de prédiction ou d’ajustement ne doit être dupliquée inutilement entre les vues.