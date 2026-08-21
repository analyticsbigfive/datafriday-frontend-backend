# BUG-352-01 — Quantité attendue = Total Logistic, avec recalage automatique du registre en fin d'inventaire

> ## ⚠️ Mise à jour du même jour — PDF v3 (dernière version) + retour client
>
> Après le test client (Ulrich : « il n'y a pas de reset de la logistique quand les inventaires
> sont finis […] Le plus simple est un reset automatique en fin d'inventaire »), l'owner a
> simplifié la spec : **« La quantité attendue sera toujours le Total sur la logistique pour
> chaque élément. »** (PDF v3, pages 1-2 : `Total Logistic = Quantité attendue`, les deux écrans.)
>
> Conséquences sur cette fiche :
> - la **formule d'addition** « comptage + Logistic » et sa bascule anti-double-comptage
>   (décrites ci-dessous, PDF v2) sont **retirées** — l'attendu = `computeLogisticExpected`
>   seul, `source: 'logistic-live'`, comme depuis le 2026-08-20 (fiche backend 134-01) ;
> - le **recalage automatique du registre à la génération de la réconciliation**
>   (`pushCountToLogistic`, pre ET post) est **conservé** — c'est lui qui rend la règle juste :
>   le Total Logistic contient toujours le dernier comptage physique ;
> - toutes les corrections d'**affichage** (bandeau, infobulle, libellés en unités, récap de
>   section retiré, chip Attendu du pre-event) sont conservées telles quelles ;
> - le test négatif d'Ulrich s'explique : le recalage n'était **pas déployé** (code local,
>   non commité). ⚠️ À vérifier séparément, signalé par lui : le bouton **Reset** de l'écran
>   Logistic « n'a pas l'air d'actionner quoi que ce soit » — non reproduit ici, à investiguer.
>
> La section historique ci-dessous documente la version v2 (addition), pour la traçabilité.


- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (l'écart relevé après un match était oublié par le calcul suivant)
- **Domaine** : Stock & inventaire (Pre/Post-event Inventory, Logistic)
- **Repo(s) concerné(s)** : `datafriday-frontend-backend` (backend + frontend)
- **Décidé le** : 2026-08-21 (PDF « Analyse - Inventaire - Timeline » p. 1-2 + précisions JLH)
- **Fichiers** :
  - `backend/src/features/inventory/inventory.service.ts`
  - `backend/src/features/logistics/logistics.service.ts` (`reset`, paramètre `meta`)
  - `frontend/src/views/SpaceInventoryView.vue`, `src/components/InventoryCountingInterface.vue`
  - `frontend/src/utils/preEventExpected.js`, `src/i18n/translations.js`

## Demande

PDF du 2026-08-21, une page par écran :

```
Pre-event  : total du comptage POST-event précédent + Logistic = quantité attendue
Post-event : total du comptage PRE-event du match   + Logistic = quantité attendue
```

Exemple du PDF (Bun Burger, boutique 1B) : 80 Pc comptés + 168 Pc Logistic = **248 Pc**.

Précisions de l'owner le même jour, qui complètent la formule :

1. Si la Logistique est **remise à zéro**, la formule ci-dessus s'applique telle quelle.
2. Si la Logistique a été **recalée sur le comptage pre-event** après celui-ci, l'attendu du
   post-event est **le total Logistic seul**.
3. Symétriquement pour le pre-event si le recalage vient du comptage post-event.
4. « Idéalement il faudrait que ce soit reset sur pre ou post event inventory quand ils sont
   terminés et que la réconciliation est faite. »

Demandes d'affichage jointes : retirer le récap « Attendu » de l'en-tête de section, écrire les
attendus dans l'unité du champ qu'ils légendent, et clarifier les bandeaux.

## État avant correction

Depuis la décision du 2026-08-20 (fiche backend
[134-01](../../../backend/docs/bugs/134_01_attendus_inventaire_source_etat_logistic.md)), l'attendu
valait **l'état Logistic seul**, sans jamais additionner de comptage. Or `StockLevel` n'est écrit que
par `logistics.reset()`, appelé à deux endroits seulement : l'Inventory Reset manuel et l'ouverture
des portes (qui y pousse le comptage **pre**-event). Le comptage **post**-event n'avait donc
**aucun** chemin vers le registre — la règle « documenter ≠ resetter » (module 10 §7.3) l'interdisait
explicitement.

Conséquence mesurable, avec les chiffres de l'exemple du dossier (module 10 §10) : le registre dit
88 après le match, on compte physiquement 85, et l'attendu du match suivant repart de **88**. Les 3
unités manquantes sont écrites dans le document de réconciliation, puis ignorées par le calcul —
et réclamées à nouveau au cycle suivant.

## Correction

### La bascule anti-double-comptage

`computeExpectedPerPdf` (chemin **unique** du GET pre-event-baseline, du GET post-event-baseline et
de la réconciliation pre-event) :

```
ancre = comptage de référence (post-event du match précédent en pre, pre-event du match en post)
reset = dernier recalage du registre (StockReconciliation kind = null)

reset issu d'un comptage d'inventaire ET postérieur à l'ancre
   → attendu = total Logistic          (le comptage y est déjà)
sinon
   → attendu = total de l'ancre + total Logistic
```

La provenance d'un reset est lue dans `meta.source === 'inventory-count'`, avec repli sur
`createdBy === 'system-live-door-opening'` pour les resets antérieurs à ce marquage. La formule
effective est renvoyée au client (`source`, `expectedMeta`) et archivée dans `meta.baseline` des
documents : deux documents calculés différemment ne sont plus indiscernables.

Somme faite **en unités** (seule grandeur commune aux deux termes), puis re-découpée en packed/loose
dans le conditionnement de l'INVENTAIRE (BUG-239). Article absent des deux termes → absent du blob
(« — »), jamais un 0 fabriqué. Aucune ancre (premier cycle) → terme comptage nul, l'attendu se
réduit au total Logistic.

### Le recalage automatique à la réconciliation

`pushCountToLogistic` pousse le comptage dans le registre à la génération du document, pour les
**deux** écrans (`meta = { source: 'inventory-count', phase, eventId }`). C'est ce qui rend la
branche « total Logistic seul » nominale plutôt qu'exceptionnelle : le registre repart toujours du
dernier comptage physique.

- **Jamais bloquant** : un échec de recalage est journalisé, le document de réconciliation est
  conservé — c'est lui que l'utilisateur a demandé.
- Source du comptage côté post-event : le comptage fusionné en base
  (`getBySpaceAndEvent(..., 'post-event')`), pas les lignes du DTO — celles-ci ne portent qu'un total
  en unités (`countedUnits`), s'en servir obligerait à refabriquer une répartition packed/loose.
- Le déclencheur d'ouverture des portes (`autoInitLiveStockFromPreEventInventory`) est **conservé**
  comme filet : il est idempotent (marqueur `KvStore`) et ne fait rien si le stock est déjà à jour.

⚠️ **Conséquence assumée** : un reset matérialise les ventes non couvertes en mouvements et
**déplace l'ancre de dérivation des ventes** de l'écran Logistic. La règle « documenter ≠ resetter »
est donc levée, sciemment, par cette décision.

### Affichage

- **Bandeau rouge** : le nom court de la fiche (« PFC-Nice ») est retiré — `contextAnchorLabel`
  nomme déjà le match par ses deux équipes (« Prochain Évènement : Paris FC vs OGC Nice »). Les deux
  côte à côte donnaient l'impression de DEUX événements. `matchLabel` retombe sur le nom de la fiche
  quand les équipes ne sont pas renseignées : rien n'est perdu. La computed reste utilisée par
  l'en-tête d'impression.
- **Cartouche de provenance supprimée** : elle s'affichait à chaque chargement pour tout profil
  autorisé. Sa phrase — désormais dépendante de la formule appliquée — et l'**heure de calcul**
  (`asOf`, qui manquait) rejoignent l'infobulle de chaque attendu. Les cartouches d'anomalie (403,
  serveur non à jour, comptage reporté du pre-event) restent : règle « plus de tirets muets »
  (module 10 §14.4).
- **Récap « Attendu » d'en-tête de section retiré** des deux écrans : il sommait des articles
  d'unités différentes au-dessus d'une liste où chaque ligne porte déjà son attendu. Code mort
  supprimé dans la foulée (prop `expectedSectionUnits`, `expectedSectionUnitsFor`, export
  `aggregateExpectedUnitsFromIndex`, clés `preInvExpectedBadge`, `describe` dédié du spec) —
  **0 occurrence résiduelle** vérifiée par grep. Ferme la [Question #60](../QUESTIONS_A_BERTRAND.md)
  faute d'objet.
- **Libellés dans l'unité du champ** : « Attendu : 2 cartons de 40 », « Attendu : 10 Pc en vrac »,
  « Attendu : 90 Pc ». Le conditionnement et l'unité sont déjà connus du composant (`packedUnitsLabel`
  les compose pour le libellé du champ) — aucun appel réseau, aucun champ backend en plus. Repli sur
  la formulation d'origine quand le conditionnement est inconnu.
- **Chip « Attendu » du total en pre-event** : ce créneau n'affichait que le **besoin prédit**, une
  autre grandeur — l'attendu de stock n'était lisible nulle part au niveau de l'article, il fallait
  additionner les deux hints de tête. Les deux chips coexistent, sous leurs deux permissions
  (`front.fb.preInventoryExpected` / `front.fb.preInventoryPredicted`).

## Risque de régression / à surveiller

- **Le recalage automatique déplace l'ancre des ventes dérivées** : à surveiller sur l'écran
  Logistic après la première réconciliation post-event en conditions réelles.
- Un espace sans aucun comptage enregistré (cas de Stade Jean Bouin : 0 snapshot, 17 lignes de
  stock) garde exactement les valeurs d'avant — le terme comptage est nul. C'est le bon test de
  non-régression.
- Le marqueur `meta.source` n'existe pas sur les resets antérieurs : le repli `createdBy` couvre
  l'auto-init d'ouverture des portes, mais un **reset manuel** ancien n'est pas reconnu comme issu
  d'un comptage → l'attendu additionnera le comptage d'ancrage. Se résorbe au premier reset postérieur.
- RBAC inchangé : gating serveur 403 sur les deux routes baseline.

## Vérification

- Backend : `npx jest src/features/inventory` → **59 verts**, dont 7 cas ajoutés (les deux branches
  de la formule, reset antérieur/postérieur, article hors registre, absence de match précédent,
  déclenchement du recalage avec son marqueur, recalage en échec sans perte du document).
- Front : `npx jest` → **1118 verts**, 4 échecs préexistants connus (`apiOrMock`,
  `spaceMenusInventory`, `eventDetailsEditor`), identiques avant/après.
- Recette : cf. § Vérification du plan — un cycle complet (compter le pre-event → générer la
  réconciliation → l'attendu du post-event doit afficher le **total Logistic seul**, pas la somme).

## Références

- PDF « Analyse - Inventaire - Timeline » (2026-08-21), pages 1 et 2.
- [Question #61](../QUESTIONS_A_BERTRAND.md) — tranchée par ce PDF.
- Fiche backend [134-01](../../../backend/docs/bugs/134_01_attendus_inventaire_source_etat_logistic.md)
  (décision du 20/08 que celle-ci remplace), [341-01](341_01_attendus_inventaire_sources_incorrectes.md).
- [`AUDIT_2026-08-21_INVENTAIRE_ATTENDUS.md`](../AUDIT_2026-08-21_INVENTAIRE_ATTENDUS.md).

JLH
