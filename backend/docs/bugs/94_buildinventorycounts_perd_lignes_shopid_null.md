# BUG-94 — Inventaire affiché vide malgré des données : lignes `shopId=null` perdues + early-return

- **Statut** : 🟢 Corrigé (en code, non déployé)
- **Sévérité** : 🟠 Majeur (données présentes, écran vide)
- **Domaine** : Stock (Inventory)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/features/inventory/inventory.service.ts:16-55, 61-112, 175-192` (avant fix)

## Symptôme

Un espace dont les `InventoryCount` ont tous `shopId=null` (lignes legacy ou écrites par un client sans shop) affiche un inventaire **vide** alors qu'un `InventorySnapshot` complet existe en base.

## Cause racine

`buildInventoryCounts` **skippe** les lignes `shopId=null` (inadressables par la shape front `{[shopId]: {[itemId]: …}}`) — légitime. Mais `getBySpaceAndEvent` early-return sur `counts.length > 0` : la branche counts est servie même quand elle produit `{}`, en **ignorant le snapshot** pourtant présent. Même motif dans `getLatestBySpace` (branche `countIsNewer`).

## Correction

2026-07-18 : la branche counts n'est servie que si `buildInventoryCounts` produit un objet **non vide** ; sinon repli sur le snapshot (puis état vide). La sémantique métier des lignes `shopId=null` (comptage « niveau espace » ?) reste à trancher → question posée dans `docs/QUESTIONS_A_BERTRAND.md`. Spec : `inventory.service.spec.ts` (« falls back to the snapshot when ALL counts have null shopId »).

## Risque de régression / à surveiller

Un espace mixte (lignes null + lignes adressables) sert toujours la branche counts (les lignes null y restent ignorées — comportement inchangé). Si Bertrand veut exposer les comptages niveau-espace, prévoir une clé sentinelle + adaptation front.

## Références

- BUG-93 (même table), `docs/QUESTIONS_A_BERTRAND.md`
