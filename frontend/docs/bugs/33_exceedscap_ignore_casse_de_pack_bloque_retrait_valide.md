# BUG-033 — `exceedsCap` ignore la casse de pack : bloque des retraits/transferts pourtant valides

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (bloque des opérations légitimes, bouton grisé sans explication claire)
- **Domaine** : Stock (Logistic)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `src/components/LogisticMovementDialog.vue` (`exceedsCap`, `availableCap`)

## Symptôme

Panneau "Supprimer un produit" (BARRE CHOCOLATEE, 3 Pc/pack) : stock disponible affiché
`Disponible : 2 Cartons (6 Pc)` (voir BUG-032). Demande : 0 carton + 1 loose (1 Pc). Le bouton
"Supprimer" reste grisé (désactivé) alors que l'opération est parfaitement valide : il reste 6 Pc
au total, retirer 1 Pc ne pose aucun problème (le backend casserait 1 carton : 1 carton + 2 loose
restants).

## Cause racine

`exceedsCap` (`LogisticMovementDialog.vue:340-347` avant fix) comparait `loose` demandé au
`cap.loose` **brut** (`loose > cap.loose`) — ici `1 > 0` → `true` → bouton désactivé — sans jamais
considérer qu'un pack entier disponible peut être "cassé" pour fournir du loose (casse de pack),
alors que c'est exactement ce que fait le backend (`normalizeLevel`/`applyLevelDelta`,
`logistics.service.ts:149-160,185-196`) : la contrainte réelle backend est

```
insufficient = (rawPacked < 0) || (rawPacked*unitsPerPack + rawLoose < 0)
```

ce qui revient à : on ne peut jamais retirer plus de packs ENTIERS que disponible, mais le
TOTAL en unité réelle (packed×unitsPerPack + loose) suffit à couvrir la demande — pas besoin que
`loose` seul suffise. Le garde-fou front, en comparant `loose` seul, était strictement plus
restrictif que le backend et bloquait des opérations que le backend aurait acceptées.

## Correction

`exceedsCap` compare désormais le total en unité réelle (`packed*unitsPerPack + loose`, demandé
vs disponible) quand `unitsPerPack` est connu — miroir de la formule backend — tout en gardant la
contrainte séparée `packed > cap.packed` (on ne peut toujours pas retirer plus de packs entiers
qu'il n'en existe). Repli sur l'ancienne comparaison champ par champ si `unitsPerPack` est inconnu
(comportement inchangé pour ce cas, déjà couvert par le commentaire d'origine "le backend reste
juge de paix final").

**Insuffisant seul** : ce fix front débloquait le bouton, mais la soumission échouait toujours
côté backend avec `Stock insuffisant` — root cause distincte et plus profonde, voir
`api-datafriday-staging/docs/bugs/50_unitsperpack_jamais_resolu_hors_marketprice_bloque_casse_de_pack.md` :
`createMovement` ne résolvait `unitsPerPack` que via un `marketPriceId`, or un produit fini/component
n'en a jamais — la casse de pack était donc impossible côté backend pour ces denrées, quel que soit
le garde-fou front. Corrigé dans la même session (nouvelle méthode
`resolveUnitsPerPackForItemKey`).

## Risque de régression / à surveiller

- Vérifier qu'une demande dépassant réellement le total disponible reste bien bloquée (ex.
  demander 3 Pc quand seulement 2 Cartons de 3 Pc = 6 Pc... ce cas passe ; tester aussi un vrai
  dépassement, ex. demander 7 Pc sur 6 disponibles → doit rester bloqué).
- Vérifier qu'une demande de packed strictement supérieure au nombre de cartons disponibles reste
  bloquée même si le total en Pc suffirait autrement (on ne peut pas "inventer" un carton entier).
- Aucun test automatisé sur ce composant — vérification manuelle à refaire sur les 3 scénarios :
  suppression directe, transfert vers PDV, transfert vers Storage.

## Références

- BUG-032 (même fichier, même session de diagnostic) — le bandeau "Available" affiche déjà le
  total équivalent ; `exceedsCap` doit être cohérent avec ce total plutôt qu'avec le loose brut.
