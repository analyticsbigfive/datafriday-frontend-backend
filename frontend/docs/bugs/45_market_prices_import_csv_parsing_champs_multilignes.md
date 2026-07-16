# BUG-045 — Import CSV Market Prices : parsing casse sur un champ entre guillemets contenant un saut de ligne

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/drawers/MarketPriceCsvImportDrawer.vue:189-215` (avant fix)

## Symptôme

Un CSV valide (RFC 4180) contenant un champ entre guillemets avec un retour à la ligne à
l'intérieur (ex. une note multi-ligne) voit ses colonnes désalignées silencieusement après ce
champ — pas d'erreur affichée, juste des données décalées dans les lignes suivantes.

## Cause racine

Le parseur maison `parseCSV()` (avant fix) découpait tout le texte en lignes via
`clean.split(/\r?\n/)` **avant** toute prise en compte des guillemets (ligne 192). Un saut de
ligne à l'intérieur d'un champ quoté n'était donc jamais reconnu comme faisant partie du champ :
il terminait prématurément la "ligne" logique, décalant toutes les colonnes de la vraie ligne
suivante.

## Correction

`parseCSV()` parcourt désormais le texte caractère par caractère sur **l'intégralité du fichier**
(pas ligne par ligne au préalable) : un `\n`/`\r` n'est traité comme séparateur de ligne que
lorsque `inQuote` est `false`. Un saut de ligne à l'intérieur d'un champ entre guillemets est donc
conservé comme partie du contenu du champ, exactement comme le reste du contenu quoté.

## Risque de régression / à surveiller

- Tester un CSV avec un champ multi-ligne entre guillemets (ex. `"Ligne 1\nLigne 2"`) et vérifier
  que les colonnes suivantes restent alignées.
- Vérifier la non-régression sur les CSV simples (une ligne = un enregistrement, cas immensément
  majoritaire) — le détecteur de séparateur (`detectSeparator`) continue de n'inspecter que la
  première ligne, inchangé.

## Références

- [[41_market_prices_import_csv_succes_partiel_invisible_et_doublons_mirror]] — même composant, même analyse.
