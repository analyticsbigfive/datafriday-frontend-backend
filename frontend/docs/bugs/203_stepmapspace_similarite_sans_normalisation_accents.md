# BUG-203 — Suggestion de mapping d'espace : aucune normalisation des accents/espaces (faux négatifs)

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 1)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepMapSpace.vue:573,582-605`
  (`suggestSpace`/`calculateSimilarity`)

## Symptôme

`suggestSpace` ne normalise qu'via `.toLowerCase()` avant de comparer. Deux noms qui ne diffèrent
que par des accents ou des espaces parasites — ex. location Weezevent `"Café Nord"` vs Space
`"Cafe Nord"`, ou `"Bar Nord "` (espace de fin, artefact fréquent des exports bruts) vs
`"Bar Nord"` — sont pénalisés par un vrai coût d'édition Levenshtein pour ce qu'un humain
considérerait comme un nom identique. Pour des noms courts/moyens, cela peut faire passer le score
sous le seuil `0.4` et supprimer une suggestion pourtant évidente.

## Cause racine

Ni `suggestSpace` (568-580) ni `calculateSimilarity` (582-605) n'appliquent
`.normalize('NFD').replace(/[̀-ͯ]/g,'')` (repli d'accents) ni `.trim()` avant comparaison.

## Correction

Ajout d'une méthode `normalizeForComparison(str)` dans `StepMapSpace.vue` qui applique, dans
l'ordre : `.toLowerCase()`, `.normalize('NFD').replace(/[̀-ͯ]/g, '')` (repli des accents,
plage U+0300–U+036F des marques diacritiques combinantes) puis `.trim()` (espaces parasites en
tête/fin).

`suggestSpace` normalise désormais `locationName` et `space.name` via cette méthode avant de les
passer à `calculateSimilarity` (qui reste un pur calcul de distance de Levenshtein, inchangé).
Confirmé par relecture : `calculateSimilarity` dans ce fichier n'est utilisée que par
`suggestSpace`, donc normaliser à l'entrée de `suggestSpace` couvre bien tout le chemin de
comparaison utilisé par ce composant.

Non traité (hors périmètre de ce ticket, qui porte uniquement sur `StepMapSpace.vue`) : le
composable mort `useSpaceMapping.js` réimplémente la même logique sans cette correction — reste
à corréler avec BUG-011 séparément.

## Risque de régression / à surveiller

Vérifier que le seuil `0.4` reste pertinent une fois la normalisation ajoutée (des noms
auparavant sous le seuil pourraient désormais le dépasser en masse si le seuil n'est pas
réévalué).

## Références

- Dette technique : composable mort `useSpaceMapping.js` (même logique, même lacune).
