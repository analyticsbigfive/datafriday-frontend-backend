# BUG-258-02 — Import CSV Events : ligne ignorée (doublon) comptée aussi comme erreur, affichée deux fois dans les résultats

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-31, résultat d'import fourni par l'utilisateur : "10 lignes non
  importées" incluant "Ligne 64 : Ignoré : un événement "FTTOUR" existe déjà à cette date" listée
  au même titre que de vrais échecs réseau (429).
- **Fichiers** : `src/components/events/drawers/CsvImportDrawer.vue` (`doImport`, ~ligne 1412)

## Symptôme

Sur l'écran de résultats d'import CSV, une ligne correspondant à un doublon volontairement ignoré
(événement déjà existant à cette date) apparaît à la fois dans l'alerte dédiée "ligne(s) ignorée(s)
(doublon déjà présent)" **et** dans l'alerte "X ligne(s) non importée(s)" (normalement réservée aux
vrais échecs). Un import avec des doublons légitimes gonfle donc artificiellement le compteur
d'échecs et brouille la lecture des vraies erreurs (ex. rate-limit) au milieu de simples skips
attendus.

## Cause racine

`doImport()` (`CsvImportDrawer.vue:1412-1414` avant fix) : quand `existingKeys.has(built.dedupKey)`
est vrai, le code faisait `skippedCount++` **et** `errors.push({ row, message: 'Ignoré : ...' })`.
Le template (`v-alert` "non importée(s)", ~ligne 334) rend `importResults.errors.length` et liste
chaque entrée de `errors` — donc ce skip intentionnel s'y retrouvait aussi, en plus d'être compté
dans l'alerte "ignorée(s)" séparée (déjà présente dans le template). Rien dans le code ne
documentait ce double comptage comme voulu ; le doc de fix `[[137_csv_import_events_sans_dedoublonnage]]`
sous-entend au contraire que le skip doit être distinct d'un échec.

## Correction

Retrait du `errors.push(...)` dans la branche doublon — seul `skippedCount++` reste. Une ligne
ignorée pour doublon n'apparaît plus que dans l'alerte "ignorée(s) (doublon déjà présent)".

## Risque de régression / à surveiller

- Vérifier au prochain import contenant un doublon volontaire que la ligne concernée n'apparaît
  **que** sous "ignorée(s)", plus sous "non importée(s)".
- Pas de test unitaire ajouté (pas de suite de tests existante pour ce composant) — vérification
  manuelle recommandée avec un petit CSV contenant une ligne dupliquée (même nom + même date qu'un
  event déjà en base).
- Ne touche pas au classement des vraies erreurs (parsing, association manquante, 429) — celles-ci
  restent dans `errors` sans changement.

## Références

- [[137_csv_import_events_sans_dedoublonnage]] — introduit la dédup et le comptage `skipped`.
- [[252_02_csvimportdrawer_rate_limit_429_import_masse_echec_definitif]] — même écran de résultats,
  cause distincte (rate-limit), découvert dans le même signalement utilisateur.
