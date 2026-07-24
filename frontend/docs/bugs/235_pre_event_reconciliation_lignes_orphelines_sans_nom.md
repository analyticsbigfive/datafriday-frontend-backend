# BUG-234 — Réconciliation pré-événement : lignes sans nom (« — ») = comptages orphelins pointant vers des articles/PdV supprimés

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (document de réconciliation illisible et gonflé : sur le cas observé, 54 lignes « — » sur 81 ; écart/manquant faussés par des comptages sans identité)
- **Domaine** : Stock — Pre-event Inventory (voir `../modules/10_POST_EVENT_INVENTORY.md` §8.4)
- **Repo(s) concerné(s)** : backend (fix principal) ; frontend seulement pour le rendu du symptôme
- **Découvert le** : 2026-07-24
- **Fichiers** :
  - `backend/src/features/inventory/inventory.service.ts:588-618` (`createPreEventReconciliation` — résolution des noms `elementName`/`itemName` par jointure sur le catalogue courant, fallback `''`)
  - `backend/prisma/schema.prisma:2477-2478` (`InventoryCount.shopId`/`itemId` : chaînes libres, **aucune FK**)
  - `src/components/InventoryReconciliationView.vue:79/87/122/134` (rendu `label || '—'`)

## Symptôme

Sur `/spaces/:spaceId/pre-inventory`, une fois la réconciliation lancée, de nombreuses lignes
s'affichent avec « — » à la place du nom d'article (vue PAR ARTICLE) et parfois du nom de PdV
(vue PAR PDV). Le même article apparaît parfois deux fois : une ligne nommée ET une ligne « — ».

Cas réel (Supabase `datafriday-dev`, doc `StockReconciliation.id = cmryrr6is04wqctjd101ulj5l`,
event `70d4d594-6545-4ce8-ad55-28b48b9e4767`, 81 lignes) :

- 27 lignes OK · **53 lignes = nom d'article vide** · **1 ligne = nom de PdV vide**.
- Les `itemId` des lignes vides sont des **cuid** (`cmr71fv2r000855v39xbj9qkj`, …), 28 distincts,
  **présents dans aucune table** de la base. Les lignes OK ont des `itemId` **UUID** qui résolvent
  (`10fd36ab…` → BARRE CHOCOLATEE, `34057c71…` → 2 X TENDERS FRITES).
- La ligne PdV vide : `elementId = cmr3nxyxk007wttrip4s7pqa0` → **SpaceElement supprimé**.
- Catalogue du tenant : 1483 MenuItem en UUID + 22 cuid résiduels.

## Cause racine

Les lignes « — » sont des **comptages orphelins** : leurs `itemId`/`shopId` référencent des
`MenuItem`/`SpaceElement` **supprimés** du catalogue.

Chaîne : les comptages (`InventoryCount`) ont été saisis quand les articles avaient des ids
**cuid** ; ces lignes catalogue ont ensuite été supprimées/remplacées (ids absents de toute table,
cohérent avec un **ré-import** ayant régénéré le catalogue en UUID — mêmes noms, d'où le doublon
nommé/« — »). Comme `InventoryCount.itemId`/`shopId` sont des chaînes libres **sans FK**
(`schema.prisma:2477-2478`), aucun cascade delete ne nettoie ces comptages : ils survivent en
orphelins. `createPreEventReconciliation` résout les noms par jointure sur le catalogue **courant**
(`spaceElement.findMany` `:576`, `menuItem.findMany` `:582`) et retombe sur `''` en cas de miss
(`:608`, `:610`) → rendu « — » côté front (`InventoryReconciliationView.vue:79/87`).

**Contrainte** : les anciens noms sont **irrécupérables** — les MenuItem cuid sont hard-deleted et
`InventoryCount` ne stocke jamais de nom (que des ids + quantités). Aucun rattachement par nom
possible.

## Correction

Décision produit (validée avec l'utilisateur, 2026-07-24) : (1) **exclure** ces lignes orphelines
du document ; (2) **nettoyer** une fois les `InventoryCount` orphelins existants. Pas de prévention
de récurrence dans ce lot.

- **Fix 1 (symptôme, backend)** — `createPreEventReconciliation` filtre les clés dont l'`elementId`
  ET l'`itemId` résolvent (`elementNameById.has(...) && itemNameById.has(...)`) avant de construire
  les lignes ; `logger.warn` du nombre d'orphelins exclus. `inventory.service.ts:597-613`. Comme
  `StockReconciliation.lines` est un snapshot **régénéré** à chaque lancement, relancer la
  réconciliation suffit à produire un document propre.
- **Fix 2 (nettoyage, SQL one-off)** — deux scripts datés dans `backend/prisma/sql/`, exécutés en
  deux temps séparés (contrôle humain entre backup et delete) :
  `2026-07-24_cleanup_orphan_inventorycount_A_backup.sql` (sauvegarde + décompte),
  `2026-07-24_cleanup_orphan_inventorycount_B_delete.sql` (DELETE gardé par un bloc `DO` :
  abandon si backup vide ou volume > seuil).

Non déployé : build/tests/déploiement backend + exécution SQL à la charge de l'équipe (dev d'abord,
puis prod).

## Risque de régression / à surveiller

- **Récurrence** : sans FK ni stabilité d'ids au ré-import de catalogue, de nouveaux orphelins
  peuvent réapparaître à chaque ré-import → Fix 2 est un correctif ponctuel, à rejouer. Prévention
  non incluse (choix). Un durcissement (FK + `onDelete`, ou préservation des ids au ré-import, ou
  stockage du nom dans `InventoryCount`) reste à arbitrer.
- **Divergence Fix 1 / Fix 2 (intentionnelle)** : Fix 1 exclut les items absents du catalogue **de
  ce tenant** (jointure filtrée `tenantId` `:583`) ; Fix 2 supprime les items absents de **tout**
  `MenuItem` (non scopé tenant). Sur les données observées elles coïncident. Ne pas « harmoniser »
  en scopant le DELETE par tenant.
- **Suppression irréversible** de quantités comptées (déjà inexploitables). Table `_backup_…` pour
  rollback manuel ; exécuter dev d'abord, relire `to_delete` avant la phase B.
- **Asymétrie latente** (hors scope) : `menuItem.findMany` filtre `tenantId` (`:583`),
  `spaceElement.findMany` non (`:576`). Sans impact sur ce bug.
- **Variante post-event** (route `/inventory`) : mécanisme parallèle côté client
  (`nameOf` → `''`, `src/utils/postEventReconciliation.js:60-64`). Non traité ici ; à ouvrir en
  fiche séparée si le symptôme y apparaît.
- Vérif après fix : relancer la réconciliation → 0 ligne « — » ; contrôle SQL
  `count(*) FILTER (WHERE itemName='' OR elementName='')` sur le dernier doc pre-event = 0.

## Références

- [`233_pre_event_expected_fuite_via_reconciliations.md`](233_pre_event_expected_fuite_via_reconciliations.md)
  (même méthode `createPreEventReconciliation` ; §Correction y mentionne déjà le « — » côté front,
  mais pour les colonnes de **valeur**, pas les **noms** — problème distinct).
- [`232_pre_event_expected_non_normalise_negatifs.md`](232_pre_event_expected_non_normalise_negatifs.md).
- [`183_double_persistance_comptages.md`](183_double_persistance_comptages.md) (double écriture
  InventoryCount / snapshot — contexte du blob compté).
- [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) §8.4 (lignes serveur pre-event).

---

Rédaction : **JLH**, 2026-07-24.
