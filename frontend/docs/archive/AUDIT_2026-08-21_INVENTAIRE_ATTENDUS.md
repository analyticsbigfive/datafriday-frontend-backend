# Pre/Post-event Inventory — audit de conformité au brief « quantités attendues » (2026-08-21)

> ## ⚠️ Mise à jour du même jour — l'arbitrage du § 3 est TRANCHÉ
>
> Le PDF « Analyse - Inventaire - Timeline » (pages 1-2) et les précisions de JLH ont tranché la
> question de formule que cet audit laissait ouverte : **`attendu = dernier comptage + stock
> Logistic`**, avec une bascule anti-double-comptage (si le registre a déjà été recalé sur ce
> comptage, on prend le total Logistic **seul**), et un **recalage automatique du registre à la
> génération de la réconciliation**, sur les deux écrans.
>
> C'est l'**Option B** du § 3.3 ci-dessous, complétée par la formule d'addition de l'Option A.
> La [Question #61](QUESTIONS_A_BERTRAND.md) passe donc en 🟢, et la
> [Question #60](QUESTIONS_A_BERTRAND.md) se ferme faute d'objet (badge de section retiré).
> Implémentation et détails : fiche
> [352-01](bugs/352_01_attendus_comptage_plus_logistic.md). Le reste de cet audit (constats,
> conformité ligne à ligne) reste valable tel quel.

> Audit demandé le 2026-08-21 : relire les deux écrans d'inventaire contre le brief produit
> (« attendu pre = post-event + Logistic », « attendu post = pre-event + Logistic ventes
> comprises », affichage réservé Admin / Directeur de site, réconciliation sous les filtres).
> Méthode du dossier ([modules/00_INDEX.md](modules/00_INDEX.md)) : **chaque verdict est ouvert
> dans le fichier cité**, aucune affirmation de mémoire. Aucune requête base (règle
> lecture seule) — les chiffres Jean Bouin cités viennent des captures fournies et des fiches
> [338-02](bugs/338_02_stade_jean_bouin_agregation_vide_events_saison_vs_match.md) /
> [NOTE_BERTRAND_2026-08-21_CA_ANALYSE.md](NOTE_BERTRAND_2026-08-21_CA_ANALYSE.md).
>
> Complément de [modules/10_POST_EVENT_INVENTORY.md](modules/10_POST_EVENT_INVENTORY.md) §§ 8, 11,
> 13, 14 — cette page ne duplique pas le module, elle en donne l'état de conformité au 2026-08-21
> et la liste des écarts restants.

---

## En clair

Sur les deux écrans d'inventaire, **presque tout ce que demande le brief est déjà là** : le bandeau
nomme le match (« Prochain Évènement : … » / « Post Inventaire de l'évènement : … »), le bouton
s'appelle « Générer la réconciliation », la section Réconciliation est bien sous les filtres, et les
quantités attendues s'affichent sous Packed et sous Loose, réservées aux profils autorisés. Les
captures qui accompagnent la demande sont **antérieures** aux correctifs des 4, 19 et 20 août.

Il reste **trois choses**, et une seule est un vrai désaccord :

1. **Un désaccord de formule.** Le brief dit : « l'attendu du pre-event part du comptage post-event
   du match précédent ». Le code dit, depuis la décision du 20/08 (fiche backend 134-01) : « l'attendu
   part de l'état du stock Logistic au chargement de l'écran ». Ce n'est pas la même chose, et le
   comptage post-event **n'entre jamais** dans le registre Logistic : ce qu'on a compté après le
   dernier match est purement et simplement ignoré par l'attendu du match suivant. Il faut trancher —
   c'est déjà la [Question #61](QUESTIONS_A_BERTRAND.md), aujourd'hui sans réponse.
2. **De la lisibilité.** L'attendu s'affiche « Expected quantity : 2 » sous un champ intitulé
   « Number of Cartons of 40 » : le 2 est un nombre de cartons, mais rien ne le dit. Demande du
   21/08 : écrire « 2 cartons de 40 », « 10 pc en vrac », « 90 pc au total ».
3. **Deux placements à corriger** : retirer le récap « Expected quantity » de l'en-tête de section
   (demande du 21/08), et afficher l'attendu à côté du total **aussi en pre-event** (aujourd'hui ce
   créneau y affiche le « Besoin prédit », qui est une autre grandeur).

---

## 1. Ce que demande le brief, ligne à ligne

Source : message du 2026-08-21 (texte tapé) + deux captures annotées, complétés par le message de
suivi du même jour (2 captures Jean Bouin réelles).

| # | Exigence | Écran |
|---|---|---|
| B1 | Pre-event affiche **toujours le prochain événement** de l'espace | pre |
| B2 | Bandeau : nommer le match — « Prochain Évènement : X » / « Post Inventaire de l'évènement : X » | les deux |
| B3 | Packed/Loose pré-remplis par défaut = post-event précédent ± mouvements Logistic | pre |
| B4 | Ces valeurs **sous** les champs Packed et Loose | les deux |
| B5 | Visible **Directeur de site / Admin / Chef exécutif** seulement ; les autres comptent à l'aveugle | les deux |
| B6 | « Sauvegarder » génère une **réconciliation** attendu vs compté | les deux |
| B7 | Réconciliations listées dans la section Réconciliation | les deux |
| B8 | Section Réconciliation **en bas de la colonne gauche, sous les filtres** | post |
| B9 | Bouton renommé « Générer la réconciliation » / « Create Reconciliation » | post |
| B10 | Nombre d'unités attendues **en haut à droite de chaque menu item** (Pc, Kg ou L) | les deux |
| B11 | Post-event reste lié au **dernier événement qui a eu lieu** | post |
| B12 | Attendu post = **Pre-event Inventory + Logistic** (ventes comprises) | post |
| B13 | *(21/08)* **Pas de récap** des attendus dans l'en-tête de section | les deux |
| B14 | *(21/08)* Attendu exprimé **en unités d'inventaire d'abord** : « 2 cartons de 40 » et « 10 pc vrac » | les deux |

⚠️ **Contradiction interne du brief, tranchée** : l'annotation de la 2ᵉ capture demande l'attendu
« d'après le Réarmement (Stockup) sauvegardé pour cet événement », alors que le texte tapé demande
« Post-event Inventory + Logistic ». La source Stockup a été **retirée le 19/08** (réunion Bertrand,
fiche [341-01](bugs/341_01_attendus_inventaire_sources_incorrectes.md)) puis reconfirmée retirée le
20/08 : `fetchExpectedPlan` / `expectedUnitsByElement` n'existent plus. Les captures sont traitées
ici comme des **annotations périmées**, superseded par le texte tapé. À ne pas ré-introduire sans
décision explicite.

---

## 2. Conformité — vérifié fichier par fichier

| # | Verdict | Où c'est implémenté |
|---|---|---|
| B1 | ✅ | Mode pre = prochain futur **strict**, tout `?event=` ignoré — `resolveEventContext`, [SpaceInventoryView.vue](../src/views/SpaceInventoryView.vue) (règle « un match = un eventId », module 10 §12.4) |
| B2 | ✅ **déjà livré** | Libellés **exactement** ceux demandés : `preInvContextAnchorNext: 'Prochain Évènement : {match}'` et `invContextAnchorLast: "Post Inventaire de l'évènement : {match}"` — [translations.js:6600-6601](../src/i18n/translations.js) (EN :2056-2057) ; composition `contextAnchorLabel` [SpaceInventoryView.vue:1043-1047](../src/views/SpaceInventoryView.vue) ; rendu bandeau [:144-152](../src/views/SpaceInventoryView.vue). Les captures du brief sont antérieures au 2026-08-04. |
| B3 | ⚠️ **écart de formule** | Implémenté comme « état Logistic au chargement » — `computeLogisticExpected` [inventory.service.ts:619-690](../../backend/src/features/inventory/inventory.service.ts) → `getExpectedStockIndex` [logistics.service.ts:1372-1406](../../backend/src/features/logistics/logistics.service.ts). Détail § 3. |
| B4 | ✅ | Caption sous chaque champ, **dans les deux modes** — [InventoryCountingInterface.vue:216-222 et 242-248](../src/components/InventoryCountingInterface.vue), alimentée par `expectedForField` [SpaceInventoryView.vue:2136-2142](../src/views/SpaceInventoryView.vue) |
| B5 | ✅ | Gate **serveur** `@RequirePermissions('front.fb.preInventoryExpected')` sur les deux routes baseline — [inventory.controller.ts:100-101, 129-130](../../backend/src/features/inventory/inventory.controller.ts) ; miroir client `canSeeExpected` [SpaceInventoryView.vue:1102-1105](../src/views/SpaceInventoryView.vue) ; rôles porteurs : ADMIN, **Directeur de site** ([permission-catalog.ts:194-201](../../backend/src/core/rbac/permission-catalog.ts)), **Chef exécutif** ([:206-215](../../backend/src/core/rbac/permission-catalog.ts)) |
| B6 | ✅ | pre : `POST /inventory/:spaceId/pre-event-reconciliations`, lignes construites **côté serveur** (`createPreEventReconciliation`, [inventory.service.ts:886+](../../backend/src/features/inventory/inventory.service.ts)) ; post : `createReconciliationAfterSave` → [postEventReconciliation.js](../src/utils/postEventReconciliation.js) |
| B7 | ✅ | Liste commune `kind IN ('pre-event','post-event')` + badge de type par document — `listInventoryReconciliations` [inventory.service.ts:301](../../backend/src/features/inventory/inventory.service.ts), [InventoryReconciliationSection.vue](../src/components/InventoryReconciliationSection.vue) |
| B8 | ✅ | Section montée **après** `InventoryFilterPanel` dans `.si-left-filters` — [SpaceInventoryView.vue:110-117](../src/views/SpaceInventoryView.vue) ; accès mobile via `InventoryFilterDrawer` |
| B9 | ✅ | `invSave` = « Générer la réconciliation » / « Create Reconciliation » — [translations.js:6618](../src/i18n/translations.js) / [:2074](../src/i18n/translations.js), bouton [SpaceInventoryView.vue:202-217](../src/views/SpaceInventoryView.vue) |
| B10 | 🟠 **partiel** | **post** : chip « Expected quantity : 90 » en regard du total ([InventoryCountingInterface.vue:258-265](../src/components/InventoryCountingInterface.vue)). ⚠️ Placement réel = **ligne de total, en bas de carte, aligné à droite** (`.si-count-total`), pas « en haut à droite » comme le dit le texte du brief — **validé en l'état par la capture du 21/08** (« sur la 2e capture d'écran c'est bon »), qui remplace la formulation initiale. **pre** : ce même créneau affiche le **Besoin prédit** (`expectedTotalLabelKey` [SpaceInventoryView.vue:1119-1121](../src/views/SpaceInventoryView.vue), `expectedTotalFor` [:2168-2174](../src/views/SpaceInventoryView.vue)) → **aucun total attendu par article en pre-event**. Détail § 4.1. |
| B11 | ✅ | Mode post = dernier event **fini** strict, `?event=` futur ignoré (module 10 §12.4) |
| B12 | ⚠️ **écart de formule** | Même chemin serveur que B3 (`getPostEventBaseline` [inventory.service.ts:834-878](../../backend/src/features/inventory/inventory.service.ts)) — § 3. |
| B13 | 🔴 **à faire** | Le chip de section existe et doit être retiré — [InventoryCountingInterface.vue:73-82](../src/components/InventoryCountingInterface.vue), alimenté par `aggregateExpectedUnitsFromIndex` [preEventExpected.js:25-41](../src/utils/preEventExpected.js) |
| B14 | 🔴 **à faire** | Aujourd'hui « Expected quantity : 2 » sous un champ « Number of Cartons of 40 » — l'unité du hint n'est jamais écrite. Détail § 4.2. |

**Six exigences sur quatorze étaient déjà conformes avant cette demande** (B1, B2, B5, B6, B7,
B8, B9, B11 — huit en réalité). Ce qui reste : un arbitrage de formule (B3/B12) et trois points
d'affichage (B10 pre, B13, B14).

---

## 3. L'écart de fond : le comptage post-event n'entre jamais dans le calcul de l'attendu

### 3.1 Ce que fait le code aujourd'hui

Depuis la décision du 2026-08-20 (fiche backend
[134-01](../../backend/docs/bugs/134_01_attendus_inventaire_source_etat_logistic.md)), les deux
écrans lisent **le même nombre que l'écran Logistic** :

```
attendu(PdV × article) = StockLevel − consommation dérivée des ventes depuis l'ancre
                         (casse de pack, clamp ≥ 0)
```

`getExpectedStockIndex` ([logistics.service.ts:1372-1406](../../backend/src/features/logistics/logistics.service.ts)),
dont l'ancre est **la dernière `StockReconciliation` de `kind: null`** — c'est-à-dire un **reset
logistique**, jamais un document d'inventaire ([:1327-1335](../../backend/src/features/logistics/logistics.service.ts),
ancre `:1347`).

Or `StockLevel` n'est écrit que par `logistics.reset()`. Et `reset()` n'est appelé que :

- manuellement, par l'Inventory Reset de l'écran Logistic ;
- automatiquement à **l'ouverture des portes**, avec le **comptage pre-event** —
  `autoInitLiveStockFromPreEventInventory` ([inventory.service.ts:472-517](../../backend/src/features/inventory/inventory.service.ts)),
  déclenché par le cron [inventory-live-init.cron.ts:64](../../backend/src/features/inventory/inventory-live-init.cron.ts).

**Il n'existe aucun chemin symétrique pour le comptage post-event** (grep exhaustif du backend :
`logistics.reset` n'a que ces deux appelants). Le module 10 §7.3 le pose même comme une règle :
la réconciliation post-event « ne touche PAS aux StockLevel — documenter ≠ resetter ».

### 3.2 Conséquence, avec les chiffres de l'exemple du dossier (module 10 §10)

| Étape | Chiffre |
|---|---|
| Stock de départ (comptage pre-event, poussé dans Logistic à l'ouverture des portes) | 468 |
| Ventes dérivées du match | 380 |
| **Ce que dit le registre Logistic après le match** | **88** |
| **Ce qu'on a physiquement compté au post-event** | **85** |
| Attendu du pre-event du match suivant, **code actuel** | **88** (+ mouvements) |
| Attendu du pre-event du match suivant, **brief** | **85** (+ mouvements) |

Les 3 unités manquantes sont écrites dans le document de réconciliation post-event… puis
**oubliées par le calcul**. Au match suivant l'attendu les réclame à nouveau : le même écart
réapparaît à chaque cycle tant que personne ne fait un reset logistique manuel. C'est exactement
ce que la formule du brief (« pre = post-event + Logistic ») empêche.

### 3.3 Les deux façons d'y répondre — arbitrage demandé

Les deux tiennent ; elles n'ont pas le même coût ni les mêmes effets de bord.

**Option A — l'attendu redevient un calcul ancré sur les comptages** (retour partiel à
`computeExpected`, supprimé le 20/08)

- pre = comptage post-event du match précédent + mouvements Logistic depuis ;
  post = comptage pre-event du match + mouvements de la fenêtre − ventes.
- Littéralement le brief. Ne touche à aucun `StockLevel`, donc **aucun impact Logistic**.
- Coût : on réintroduit deux chiffres qui peuvent diverger de l'écran Logistic — c'est
  précisément ce que la décision du 20/08 voulait supprimer (« les deux écrans ne peuvent pas
  diverger »). Rouvre BUG-232/239 (ancre, fenêtre, taille de paquet) et les questions
  [#24](QUESTIONS_A_BERTRAND.md) / [#25](QUESTIONS_A_BERTRAND.md).

**Option B — le registre Logistic se recale sur le comptage post-event** (symétrique de
l'ouverture des portes)

- À la génération de la réconciliation post-event, pousser le comptage dans Logistic via
  `logistics.reset()`, comme le fait déjà le pre-event.
- L'architecture du 20/08 est conservée telle quelle (un seul chiffre, celui de Logistic), et la
  formule du brief devient **vraie par construction** : le registre repart toujours du dernier
  comptage physique.
- Coût : `reset()` matérialise des mouvements et **déplace l'ancre de dérivation des ventes** ;
  c'est la règle « documenter ≠ resetter » du module 10 §7.3 qu'on lève. Impact à mesurer sur
  l'écran Logistic et sur les ventes dérivées.

C'est mot pour mot la [Question #61](QUESTIONS_A_BERTRAND.md), ouverte depuis le 20/08 et sans
réponse. **Rien d'autre dans cet audit ne dépend de cet arbitrage** : les points § 4 peuvent être
livrés avant, quel que soit le choix.

### 3.4 Risque spécifique à Stade Jean Bouin

L'attendu « état Logistic » **déduit les ventes dérivées** des transactions rattachées aux events.
Or sur cet espace, Weezevent groupe la billetterie **par saison** et non par match (event
« STADE FRANÇAIS 25-26 », fiche
[338-02](bugs/338_02_stade_jean_bouin_agregation_vide_events_saison_vs_match.md)). Le même motif a
déjà produit, sur Auxerre, 661 unités de consommation dérivée rattachées à un event de saison
absent du calendrier (module 10 §8.5 point 6). À vérifier en recette **sur Jean Bouin
spécifiquement** : que la consommation déduite de l'attendu correspond bien au dernier match et pas
à la saison entière. Une consommation surévaluée écrase l'attendu à 0 (clamp ≥ 0) sans aucun
message.

---

## 4. Les trois points d'affichage (indépendants de l'arbitrage)

### 4.1 Pre-event : pas de total attendu par article (B10)

En regard du total compté, le composant affiche **un seul** indice, dont le libellé dépend du mode
([InventoryCountingInterface.vue:258-265](../src/components/InventoryCountingInterface.vue),
`expectedTotalLabelKey` [SpaceInventoryView.vue:1119-1121](../src/views/SpaceInventoryView.vue)) :

| Mode | Ce qui s'affiche | Grandeur |
|---|---|---|
| post | « Expected quantity : 90 » | attendu de stock ✅ |
| pre | « Besoin prédit : N » | ventes prédites Event Predict ❌ autre grandeur |

En pre-event l'attendu total par article n'existe donc nulle part : il n'est lisible qu'en
additionnant de tête les deux hints. **Proposition** : afficher les **deux** chips en pre-event,
libellés distincts, chacun sous sa permission (`preInventoryExpected` pour l'attendu,
`preInventoryPredicted` pour le prédit — [permission-catalog.ts:52-71](../../backend/src/core/rbac/permission-catalog.ts)).
Les légender du même mot fabriquerait une fausse comparaison (module 10 §14.2).

### 4.2 Libellés en unités d'inventaire (B14)

Aujourd'hui, sur `Chips Belsia nature 26/27 (PFC/SFP)` — Bloc 22bis, carton de 40 :

| Emplacement | Aujourd'hui | Proposé |
|---|---|---|
| sous « Number of Cartons of 40 » | `Expected quantity : 2` | **`Attendu : 2 cartons de 40`** |
| sous « Number of loose units » | `Expected quantity : 10` | **`Attendu : 10 pc en vrac`** |
| en regard du total | `Expected quantity : 90` | **`Attendu : 90 pc`** (infobulle `2 × 40 + 10 = 90`) |

Le conditionnement et l'unité sont **déjà disponibles côté composant** : `packedUnitsLabel`
([InventoryCountingInterface.vue:368-373](../src/components/InventoryCountingInterface.vue))
compose déjà « Number of Cartons of 40 » à partir de `item.inventoryPackaging`,
`item.inventoryQuantityPackaged` et `item.unit`. Le hint peut réutiliser les mêmes champs — aucun
appel réseau, aucun champ backend supplémentaire.

Nouvelles clés i18n à prévoir : `invExpectedHintPacked` (`{n} {packaging} de {qty}`),
`invExpectedHintLoose` (`{n} {unit} en vrac`), repli sur la formulation actuelle quand le
conditionnement est inconnu (`inventoryQuantityPackaged` absent ou = 1). Les autres écrans lisent
la même chaîne de résolution — la cohérence de la taille de paquet reste soumise à la
[Question #39](QUESTIONS_A_BERTRAND.md), non rouverte ici.

### 4.3 Retirer le récap d'en-tête de section (B13)

Le chip « Expected quantity : 90 pc » de l'en-tête de section
([InventoryCountingInterface.vue:73-82](../src/components/InventoryCountingInterface.vue)) somme
l'attendu des articles de la section, groupé par unité. Demande du 21/08 : le retirer **des deux
écrans**.

Retraits induits, à faire dans le même geste pour ne pas laisser de code mort — **liste exhaustive**
(`grep -rn "aggregateExpectedUnitsFromIndex\|expectedSectionUnits\|preInvExpectedBadge" frontend/src frontend/tests`,
14 occurrences, aucune autre) :

| Fichier | Occurrences |
|---|---|
| [InventoryCountingInterface.vue](../src/components/InventoryCountingInterface.vue) | chip `:74-82` + prop `expectedSectionUnits` `:324` |
| [SpaceInventoryView.vue](../src/views/SpaceInventoryView.vue) | 2 passages de prop `:349` (boutiques) et `:644` (stockages) — **pas de 3ᵉ chemin**, `expectedSectionUnitsFor` `:2291-2295`, import `:766` |
| [preEventExpected.js](../src/utils/preEventExpected.js) | export `aggregateExpectedUnitsFromIndex` `:25-41` (aucun autre consommateur) |
| [translations.js](../src/i18n/translations.js) | `preInvExpectedBadge` `:2058` (EN) et `:6602` (FR) |
| `tests/unit/preEventExpected.spec.js` | import `:1` + tout le `describe('aggregateExpectedUnitsFromIndex')` `:95-139` (**6 assertions à supprimer**, elles échoueraient sinon — les 2 autres `describe` (`buildPreEventExpected`, `flattenExpectedUnits`) ne bougent pas) |

⚠️ Ce badge est l'objet de la [Question #60](QUESTIONS_A_BERTRAND.md) (quel référentiel de
conditionnement pour la conversion). Le retirer **ferme la question par disparition de l'objet** —
à noter dans le tracker plutôt qu'à laisser ouverte sur un composant qui n'existe plus.

---

## 5. Plan de livraison proposé

Rien ici ne touche à la base, aucune migration.

| Lot | Contenu | Fichiers | Dépend de l'arbitrage § 3 ? |
|---|---|---|---|
| 1 | Retrait du chip de section (B13) + nettoyage prop/util/i18n/tests | `InventoryCountingInterface.vue`, `SpaceInventoryView.vue`, `preEventExpected.js`, `translations.js`, `tests/unit/preEventExpected.spec.js` | non |
| 2 | Libellés attendus en unités d'inventaire (B14) | `InventoryCountingInterface.vue`, `translations.js` (2 clés × 2 langues) | non |
| 3 | Chip « Attendu » du total en pre-event, à côté du « Besoin prédit » (B10) | `InventoryCountingInterface.vue`, `SpaceInventoryView.vue` | non pour le **placement** — mais la **valeur** affichée par ce chip est celle de la formule retenue au lot 4 : le livrer maintenant ne fige pas le chiffre |
| 4 | Formule de l'attendu : Option A ou Option B | `inventory.service.ts` (+ `logistics.service.ts` en Option B) | **oui — bloqué** |

Recette suggérée sur **Stade Jean Bouin**, Bloc 22bis, `Chips Belsia nature 26/27 (PFC/SFP)` :
(a) compte Directeur de site → les trois attendus lisibles sans calcul mental ; (b) compte sans
`preInventoryExpected` → aucun attendu, aucun 403 visible ; (c) vérifier que la consommation
déduite de l'attendu porte sur le dernier match et non sur l'event de saison (§ 3.4).

---

## 6. Questions à Bertrand — état

| # | Sujet | Statut |
|---|---|---|
| [61](QUESTIONS_A_BERTRAND.md) | Recaler le stock Logistic sur le comptage post-event ? (= arbitrage § 3) | 🔴 ouverte, **bloque le lot 4** |
| [60](QUESTIONS_A_BERTRAND.md) | Référentiel de conditionnement du badge de section | à **fermer** avec le lot 1 (objet supprimé) |
| [39](QUESTIONS_A_BERTRAND.md) | Quel référentiel fait foi pour la quantité par paquet | 🔴 ouverte, non rouverte ici |
| [45](QUESTIONS_A_BERTRAND.md) | Marge de sécurité sur le besoin prédit | 🔴 ouverte, touchée par le lot 3 (les deux chips côte à côte rendront l'écart visible) |

---

JLH
