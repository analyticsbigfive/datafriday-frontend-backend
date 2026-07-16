# BUG-049 — Import CSV Market Prices : message "Nothing to import (empty file?)" trompeur quand des lignes ont bien été envoyées

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/drawers/MarketPriceCsvImportDrawer.vue:709-732` (avant fix)

## Symptôme

À l'étape "Results", un import d'un fichier CSV manifestement non vide (étapes File/Mapping
passées avec succès, lignes visibles à l'étape 2) affiche "Nothing to import (empty file?)" —
message qui laisse croire que le fichier était vide, alors que des lignes ont bien été validées
côté client et envoyées au serveur.

## Cause racine

Le message "Nothing to import" (`noRows`) s'affichait dès que
`success === 0 && skipped === 0 && errors.length === 0`, sans distinguer deux cas très différents :
1. Le fichier n'avait effectivement aucune ligne exploitable (`validItems.length === 0`) — cas
   légitime pour ce message.
2. Des lignes ont été validées localement et envoyées via `importMarketPrices()`
   (`validItems.length > 0`), mais la réponse du backend ne contient ni `created`, ni `skipped`,
   ni `errors` interprétables — auquel cas `created`/`skipped`/`backendErrors` retombent tous à 0
   par les valeurs de repli défensives du code (`Array.isArray(response?.created) ? ... : 0`,
   etc.), sans qu'aucune erreur ne soit poussée dans `results.errors`.

Le cas 2 se produit notamment si le backend répond dans une forme différente de
`{ created, skipped, errors }` attendue par `bulkCreate()` (cf.
[[55_market_prices_bulkcreate_non_transactionnel_import_partiel_et_doublons|backend BUG-055]]) —
par exemple si le serveur backend tourne encore avec une version antérieure du code (avant ce
fix) qui renvoyait un simple tableau de prix créés au lieu de cet objet structuré. Dans ce cas
précis, l'import avait en réalité **réussi côté serveur** (les prix étaient bien créés en base),
mais le frontend, incapable de lire cette forme de réponse, affichait "fichier vide" — le pire des
messages possibles puisqu'il ne reflète ni un succès ni un échec réel.

## Correction

Ajout d'un compteur `results.sentCount` (= nombre de lignes réellement envoyées au serveur). Si
l'appel réussit mais que `created === 0 && skipped === 0 && backendErrors.length === 0` alors que
des lignes ont bien été envoyées, une erreur explicite est désormais poussée dans
`results.errors` : "Rows were sent to the server, but the response could not be read (…) — the
backend may need to be restarted with the latest changes." Le message "Nothing to import" ne peut
plus s'afficher que lorsque `validItems.length` était réellement nul dès le départ (fichier
effectivement vide ou intégralement invalide, ce dernier cas produisant de toute façon des erreurs
par ligne).

## Risque de régression / à surveiller

- Vérifier qu'un vrai fichier vide affiche toujours "Nothing to import (empty file?)".
- Vérifier qu'un import dont la réponse serveur est dans l'ancien format (tableau brut au lieu de
  `{created, skipped, errors}`) affiche désormais le nouveau message d'avertissement plutôt que
  "fichier vide" — situation qui doit alerter à vérifier que le backend tourne bien avec la
  dernière version de `bulkCreate()`.
- Ne pas oublier de vérifier manuellement, après un import qui déclenche ce message, si les lignes
  ont malgré tout été créées en base (rafraîchir `/market-prices`) — ce message signale une
  ambiguïté de lecture de réponse, pas forcément un échec réel de création.

## Références

- [[55_market_prices_bulkcreate_non_transactionnel_import_partiel_et_doublons]] (backend) — définit la forme de réponse `{created, skipped, errors}` dont l'absence déclenche ce bug.
- [[41_market_prices_import_csv_succes_partiel_invisible_et_doublons_mirror]] — même composant, bug de communication de résultats similaire.
