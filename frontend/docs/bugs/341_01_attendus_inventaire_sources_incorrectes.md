# BUG-341-01 — Inventaire pre/post-event : « Attendu » branché sur les mauvaises sources

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Stock & inventaire (Pre/Post-event Inventory)
- **Repo(s) concerné(s)** : `datafriday-web` (frontend seul — les calculs backend étaient déjà bons)
- **Découvert le** : 2026-08-19 (réunion Bertrand, Fathom 22 min)
- **Fichiers** : `src/views/SpaceInventoryView.vue`, `src/utils/preEventExpected.js`,
  `src/components/InventoryCountingInterface.vue`, `src/i18n/translations.js`

## Symptôme

Réunion Bertrand 2026-08-19 :

1. **Pre-event** — le badge « Expected » de section affichait « 1888 pc · 176,8 kg » sur un PdV
   qui vend des burgers et du Coca à la pièce (« je ne sais pas comment tu arrives à des kilos…
   il ne devrait rien avoir ici, il faut l'enlever », 4:28).
2. **Post-event** — aucun « Expected » sous les champs Packed/Loose, et le chip à côté du total
   s'appelait « Doit rester » au lieu d'« Attendu ».

## Cause racine

Aucun bug de calcul : `getPreEventBaseline` et `getPostEventBaseline` (backend
`inventory.service.ts`) calculaient déjà exactement les formules demandées en réunion
(pre : post-event précédent + Σ mouvements Logistic ; post : pre-event du match + mouvements de
la fenêtre − ventes). Le frontend affichait d'autres grandeurs sous le même libellé :

- le badge de section pre-event lisait les **cibles du plan de réarmement (Stockup) sauvegardé**
  (`fetchExpectedPlan` → `aggregateExpectedUnitsByElement`), retour JLH du 13/08 — d'où le mélange
  d'unités sans rapport avec le stock réel ;
- les hints Packed/Loose étaient explicitement désactivés en mode post
  (`:expected-for="canSeeExpected && isPreMode ? … : null"`).

## Correction

Branche `fix/inventaire-attendus-packs-rearmement` (2026-08-19) :

- **Badge de section (les deux modes)** : un seul agrégateur
  (`aggregateExpectedUnitsFromIndex`), seule la source change — pre : nouvel export
  `flattenExpectedUnits` (`preEventExpected.js`) sur le blob serveur, post : `postExpectedUnits`
  (inchangé). Groupé par `item.unit` des articles réellement présents dans la section → plus de
  kg fabriqués sur un PdV à la pièce. La source « plan Stockup » du 13/08 est retirée
  (`fetchExpectedPlan`, `expectedPlanRows`, `expectedUnitsByElement` supprimés — décision
  Bertrand 19/08 remplaçant le retour JLH 13/08, tracée ici).
- **Repli de conversion** du badge pre : `units` serveur si présent, sinon
  `packed × inventoryQuantityPackaged(écran) + loose` — le badge somme ce que les hints affichés
  laissent recalculer de tête. Référentiel serveur vs écran : divergence connue (BUG-239 / Q39),
  question relogée dans `QUESTIONS_A_BERTRAND.md`.
- **Hints post-event** : nouvelle computed `postExpectedFields` — re-découpage packed/loose de
  l'indice serveur (ventes déduites) dans la taille de paquet de l'écran. `Math.trunc` (pas
  `floor` : l'indice n'est pas clampé, décision 2026-07-30, et `floor(-3/24)` fabriquerait
  « −1 pack + 21 »). Totaux négatifs exclus des hints : le signal d'incohérence reste porté, en
  rouge, par le chip du total.
- **Libellé** : `invPostExpectedHint` « Doit rester »/« Should remain » → « Attendu »/« Expected »
  (clé distincte conservée, seules les chaînes changent).
- Tests : `tests/unit/preEventExpected.spec.js` (5 cas `flattenExpectedUnits`, dont garde
  `Number(null) = 0` et total négatif conservé).

## Risque de régression / à surveiller

- Le badge pre-event change de valeur pour tout le monde : vérifier en recette qu'il colle à
  « dernier post-event + livraisons » sur un espace réel.
- Post-event sans comptage pre-event sur CE match : ancre nulle par construction (pas de repli,
  `resolvePostEventBaseline`) → aucun attendu, message `invExpectedNoBaselinePost`. Ce n'est pas
  une régression de ce fix.
- RBAC inchangé (`front.fb.preInventoryExpected`, gating serveur) : un compte sans la permission
  ne doit toujours rien voir, sans 403 visible.

## Références

- `docs/modules/10_POST_EVENT_INVENTORY.md` §8 (mis à jour).
- BUG-232, BUG-239 (normalisation serveur des attendus), Q39.
- Réunion : https://fathom.video/share/32quEeoVBR3gAqzW8h9sJNiRSvHvareW

JLH
