# BUG-343-01 — Inventaire : « Predicted » réservé (permission dédiée), détail du calcul de l'attendu, libellé « Quantité attendue »

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟡 Mineur (RBAC + lisibilité)
- **Domaine** : Stock & inventaire (Pre/Post-event Inventory) / RBAC
- **Repo(s) concerné(s)** : `datafriday-web` + backend (catalogue de permissions, fiche miroir
  BUG-132-01)
- **Découvert le** : 2026-08-19 (réunion Bertrand ; suite de BUG-341-01)
- **Fichiers** : `src/views/SpaceInventoryView.vue`, `src/utils/preEventExpected.js`,
  `src/components/InventoryCountingInterface.vue`, `src/i18n/translations.js`,
  backend `src/core/rbac/permission-catalog.ts`

## Demandes

1. **« Le champ Predicted est réservé aux administrateurs et aux directeurs de site »**
   (réunion Bertrand 19/08). Jusqu'ici le chip « Besoin prédit » (Event Predict, pre-event) était
   gaté par `front.fb.preInventoryExpected`, détenue aussi par **Chef exécutif** — décision JLH
   du 19/08 (session 2) : livrer la permission dédiée sans attendre la réponse Bertrand (Q59).
   NB : contrairement à ce que disait Q59, **Achat F&B** ne détient pas `preInventoryExpected`
   dans le catalogue système — l'écart réel se limitait au Chef exécutif.
2. **Voir le détail du calcul** de la quantité attendue (JLH, 2026-08-19).
3. **Libellé** : « Attendu »/« Expected » → « Quantité attendue »/« Expected quantity ».

## Correction

Branche `fix/inventaire-attendus-packs-rearmement` (2026-08-19, session 2) :

- **Permission dédiée `front.fb.preInventoryPredicted`** (backend `permission-catalog.ts`,
  BUG-132-01) : nouvelle entrée du catalogue + rôle **Directeur de site** (ADMIN l'a via
  `ALL_CODES`). Chef exécutif exclu volontairement. **Aucun SQL de rattrapage** : un code neuf
  est propagé automatiquement aux tenants existants par `ensureSystemPermissionCatalog`
  (commentaire du catalogue, réf. BUG-038). Frontend : computed `canSeePredicted` — sans elle,
  `fetchPredictedNeed` ne part pas et le chip reste absent. Gating d'**affichage** : la donnée
  vient des versions Event Predict (`listEventPredictVersions`), endpoint partagé avec l'écran
  Event Predict et gaté par `front.fb.eventPredict` — un gating serveur dédié le casserait.
- **Détail du calcul** (infobulle `title` sur les hints Packed/Loose et, en post, sur le chip du
  total) : nouvel export `buildExpectedCalcDetails` (`preEventExpected.js`). Pre :
  « Post-event précédent 51 + 24 livraisons = 75 » ; post :
  « Comptage pre-event 51 + 10 mouvements − 14 vendu = 47 ». Termes **dérivés** pour que
  l'égalité affichée tienne toujours : base = comptage d'ancrage converti avec la taille de
  paquet de l'ÉCRAN (même convention que `flattenExpectedUnits`, écart BUG-239/Q39 absorbé par
  le terme dérivé) ; pre : moves = attendu − base ; post : moves = net serveur
  (`movementUnits`), vendu = base + moves − attendu (signe inversé si négatif, jamais « − -x »).
  Le chip du total pre-event (besoin prédit, autre grandeur) ne porte PAS ce détail — prop
  séparée `expectedTotalDetailFor`, null en pre.
- **Libellés** : `invExpectedHint`, `invPostExpectedHint`, `preInvExpectedBadge` →
  « Quantité attendue » / « Expected quantity » (les deux blocs de langue). `invPredictedNeedHint`
  inchangé (autre grandeur).
- Tests : `tests/unit/preEventExpected.spec.js`, 5 cas `buildExpectedCalcDetails` (pre dérivé,
  base absente, post avec net serveur, attendu négatif — identité maintenue, entrée nulle).

## Risque de régression / à surveiller

- **Chef exécutif perd le chip « Besoin prédit »** au prochain déploiement backend — c'est le
  but, mais à annoncer (il garde les attendus). Si Bertrand veut l'inclure : une ligne dans le
  rôle du catalogue, propagation automatique.
- Les infobulles `title` sont invisibles au tactile (pas de hover mobile) — assumé v1 ; si besoin
  terrain, passer à un popover clic.
- E1 (recette du détail) exige le **redéploiement backend** du catalogue ET des routes baseline.

## Références

- BUG-341-01 (sources des attendus), BUG-132-01 (fiche miroir backend), Q59 (soldée par cette
  livraison), Q39/BUG-239 (référentiel de conditionnement).
- `docs/modules/10_POST_EVENT_INVENTORY.md` §8 (mis à jour).

JLH
