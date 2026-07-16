# BUG-046 — Import CSV Market Prices : barre de progression figée pendant l'envoi réseau

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/drawers/MarketPriceCsvImportDrawer.vue:120-124,502-619` (avant fix)

## Symptôme

À l'étape "Results", le texte "Importing N/N" atteint son maximum quasi instantanément (validation
locale synchrone), puis reste figé sur "N/N" pendant toute la durée de l'appel réseau réel vers le
backend — donnant l'impression que l'import est terminé alors que rien n'est encore en base pour
un gros fichier.

## Cause racine

`importProgress` (avant fix) n'était incrémenté que pendant la boucle de validation locale des
lignes du CSV (une opération synchrone quasi instantanée), jamais pendant l'appel
`api.post('/market-prices/import', ...)` qui suit — le texte affiché ne distinguait pas les deux
phases.

## Correction

Ajout d'un état `sendingToServer` (booléon), activé juste avant l'appel réseau et désactivé dans
le `finally`. Le texte affiché bascule sur "Envoi vers le serveur…" pendant cette phase, au lieu de
laisser "Importing N/N" figé.

## Risque de régression / à surveiller

- Vérifier visuellement le changement de texte lors d'un import avec un fichier de plusieurs
  centaines de lignes (phase réseau perceptible).
- Pas de vraie progression incrémentale pendant l'envoi (toujours un seul appel HTTP pour tout le
  lot) — ce fix clarifie l'état, il ne mesure pas de progression réelle octet par octet.

## Références

- [[41_market_prices_import_csv_succes_partiel_invisible_et_doublons_mirror]] — même composant, même analyse.
