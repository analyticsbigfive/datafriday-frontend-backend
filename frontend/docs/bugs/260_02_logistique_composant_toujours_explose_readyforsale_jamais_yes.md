# BUG-260-02 — Logistique : un Component est TOUJOURS explosé en ingrédients (garde `readyForSale='Yes'` jamais vraie en pratique), contredit la décision Q13

<!-- AA = 02 (Ulrich) -->

- **Statut** : 🟡 Corrigé non testé (code changé sur `fix/logistique-transferts-composants`, pas de `pnpm dev`/build lancé dans cette session, à valider manuellement)
- **Sévérité** : 🟠 Majeur (granularité de tout le référentiel Logistique — denrées suivies, transferts, "Utilisé dans")
- **Domaine** : Stock (Logistique)
- **Repo(s) concerné(s)** : `backend/`
- **Découvert le** : 2026-08-13
- **Fichiers** : `backend/src/features/logistics/logistics.service.ts` (`componentRefsForComponent`, `perUnitForComponent` dans `explodeSalesToConsumption`)

## Symptôme

Dans la vue Logistique d'un PDV, un ingrédient comme "Badiane" apparaît comme sa propre "denrée
suivie" avec sa propre carte de stock ("Nombre de sac plastique de 0,5 Kg"), **alors que Badiane
n'est jamais utilisée directement dans aucune recette de Menu Item** — elle n'existe que comme
ingrédient de "Sauce burger 25/26 (Aux)" (un `MenuComponent`), lui-même utilisé dans "Burger 25/26
(Aux)". Le composant "Sauce burger 25/26 (Aux)" **n'apparaît jamais lui-même** comme denrée
trackable dans Logistique — seuls ses ingrédients bruts (Badiane, Canelle, etc.) y apparaissent.

Ulrich (2026-08-13) : *"normalement les sous menu dans composants et packages ne devrait pas être
affiché ; on devrait afficher directement le composant et non ses sous composants."*

## Cause racine — vérifiée

`componentRefsForComponent` (`logistics.service.ts:711`) ne traite un `MenuComponent` comme une
ligne de stock à part entière ("leaf", sans exploser sa recette) que si :

```ts
if (this.normYesNo(comp.readyForSale) === 'Yes' || depth >= 4 || visited.has(comp.id)) {
  return asLeaf();
}
```

Cette condition recopie la sémantique de `MenuItem.readyForSale` ("cet article est-il vendable tel
quel ?") sur `MenuComponent` — mais un Component n'est **par construction jamais vendu directement**
au client (ce n'est pas un article de menu), donc `readyForSale='Yes'` n'a de sens que pour un cas
limite quasi inexistant en pratique. Vérifié en base (Supabase `alsgdtewqeldrrquypdy`,
2026-08-13) :

```
readyForSale | count
--------------+-------
 (vide)       |    54
 No           |    27
```

**0 des 81 `MenuComponent` non supprimés n'a `readyForSale='Yes'`** — la garde ne se déclenche donc
jamais dans les données réelles : tout `Component` (sauf ceux en butée de profondeur 4 ou déjà
visités dans le graphe) est **inconditionnellement** explosé en ingrédients bruts. "Sauce burger
25/26 (Aux)" est vérifiée à `readyForSale='No'` en base, confirmant le mécanisme.

Git blame : cette condition existe depuis la toute première initialisation du repo
(`8bf24296`, 2026-07-15) et n'a plus été touchée depuis (`6113dce4`, même jour, n'a fait qu'ajouter
les garde-fous `depth`/`visited`). Elle **précède** et n'a jamais été alignée sur la décision
produit tranchée le **2026-08-04** ([`QUESTIONS_A_BERTRAND.md` #13](../QUESTIONS_A_BERTRAND.md)) :
*"on ne décompose plus un composant, ni au stock-up, ni à l'inventaire, ni au réarmement (…) la
sauce pickle arrive prête sur le stand : on la stocke, on la compte, on la réarme telle quelle."*
Cette décision a été implémentée le jour même dans `inventoryUtils.js` (Inventory) et
`stockPlanning.js` (Restock) — **`logistics.service.ts` n'a jamais été mis à jour en conséquence**,
alors que le principe métier énoncé ("on ne décompose plus un composant") s'applique tout autant à
la vue Logistique (mêmes identités de denrées, même intention "compté/réarmé/tracké tel quel").

## Correction

`componentRefsForComponent` (référentiel `/stock`, "Utilisé dans") retourne désormais
inconditionnellement le Component lui-même — plus aucune récursion dans
`comp.ingredients`/`comp.children`, la condition `readyForSale==='Yes'` a été supprimée (pas
seulement débranchée).

**Deuxième chemin corrigé au passage** : `perUnitForComponent` dans `explodeSalesToConsumption`
(dérivation de la consommation issue des ventes, utilisée notamment par le Pre-event Inventory)
portait **exactement le même défaut**, en copie indépendante et volontairement dupliquée (cf.
docstring de `explodeSalesToConsumption` : "la consommation ventes ne doit jamais dépendre du
chemin référentiel"). Sans ce deuxième correctif, une vente aurait continué à décrémenter le stock
de Badiane/Canelle alors que le référentiel ne trackerait plus que "Sauce burger 25/26" — les deux
chemins auraient divergé. Même traitement : un Component compte pour 1 unité de lui-même, jamais
décomposé.

⚠️ **Bascule choisie : sèche, pas de migration** — décision technique (relève d'Ulrich, lead, cf.
règle `QUESTIONS_A_BERTRAND.md` point 0), prise par défaut faute d'un signal contraire, dans la
continuité de la façon dont Q13 a elle-même été traitée pour Inventory/Restock (pas de migration a
posteriori de l'historique, seule la trajectoire à partir de la décision change). Conséquence
assumée : l'historique `StockMovement`/`StockLevel` déjà écrit au grain ingrédient (Badiane,
Canelle…) reste tel quel et continue de s'afficher dans `Historique` ; seuls les **nouveaux**
mouvements de stock sur ces PDV/Storage utiliseront désormais le grain composant (Sauce burger
25/26, Pickles 25/26…). Un `StockLevel` résiduel au grain ingrédient peut donc rester affiché
jusqu'à ce qu'il soit apuré par un mouvement/reset — à surveiller au déploiement, pas bloquant.

Corollaire direct sur [BUG-259-02](259_02_transfert_immediat_sans_confirmation_destinataire.md) : le
flux de transfert avec confirmation doit porter sur le **bon grain** — une fois ce ticket corrigé,
un transfert de "Sauce burger 25/26" ne doit plus se décomposer en un transfert de Badiane +
Canelle + etc.

## Risque de régression / à surveiller

- Toute vue qui consomme `itemRefsForMenuItem`/`componentRefsForComponent` (référentiel `/stock`,
  feuille de course Logistique, "Utilisé dans", Pre-event Inventory `computeExpected` côté
  Logistique) change de grain pour tout Component `readyForSale != 'Yes'` — auditer les
  consommateurs avant de livrer, pas seulement l'écran Logistique visible en capture.
- Vérifier si des `MarketPrice`/prix d'achat existent au grain ingrédient uniquement (Badiane,
  Canelle) sans équivalent au grain composant (Sauce burger) — la feuille de course, elle,
  continue à exploser jusqu'aux ingrédients (Q13 : "l'éclatement existe toujours, mais uniquement
  dans la feuille de course, parce qu'on n'achète pas un composant à un fournisseur") donc ce
  n'est pas remis en cause, seul le grain de **tracking Logistique** change.

## Références

- [`QUESTIONS_A_BERTRAND.md`](../QUESTIONS_A_BERTRAND.md) #13 (décision "on ne décompose plus un
  composant", 2026-08-04)
- [BUG-259-02](259_02_transfert_immediat_sans_confirmation_destinataire.md) (transfert avec
  confirmation — même domaine, à livrer au bon grain)
