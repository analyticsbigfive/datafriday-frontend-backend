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

2026-07-18 : la branche counts n'est servie que si `buildInventoryCounts` produit un objet **non vide** ; sinon repli sur le snapshot (puis état vide). Spec : `inventory.service.spec.ts` (« falls back to the snapshot when ALL counts have null shopId »).

## Sémantique tranchée — 2026-07-27

La sémantique des lignes `shopId=null` était laissée ouverte ci-dessus (question #33 du tracker front). **Tranchée par l'owner (JLH) le 2026-07-27 : il n'existe pas de comptage « niveau espace ».** Tout stock compté est dans un **point de vente** ou une **réserve** — et les deux sont des `SpaceElement` avec leur propre id, donc déjà adressables par `shopId` (l'onglet storage de l'écran compte avec `countingShop.element.id`). Une ligne `shopId=null` n'a donc **aucune signification métier** : c'est une écriture fautive.

Décision : **`shopId` devient obligatoire** — pas de clé sentinelle, pas d'adaptation front. Détail et mesures : [`REPONSES_QUESTIONS_2026-07-27.md`](../../../frontend/docs/REPONSES_QUESTIONS_2026-07-27.md) §1, §2.2.

⚠️ **Code non encore modifié** : (1) re-mesurer en prod le nombre de lignes `shopId IS NULL` ; (2) `@IsNotEmpty()` + retrait de `@IsOptional()` sur `shopId` dans `create-inventory-count.dto.ts` — un appel sans point de vente doit recevoir un **400 explicite** au lieu d'écrire une ligne invisible ; (3) `shopId String` dans `schema.prisma` + migration `NOT NULL` dans `prisma/sql/` (cf. [ADR-0002](../adr/0002_migrations_manuelles_jamais_plateforme.md)).

## Risque de régression / à surveiller

Un espace mixte (lignes null + lignes adressables) sert toujours la branche counts (les lignes null y restent ignorées — comportement inchangé). Le `skip` de `buildInventoryCounts` et la spec de repli restent en place comme filet legacy même après le passage en `NOT NULL` : ils deviennent inatteignables par l'API, pas inutiles.

⚠️ **Prémisse du symptôme non vérifiée dans la base actuelle** : mesure du 2026-07-27 sur la base staging (`alsgdtewqeldrrquypdy`) — **0 ligne `shopId IS NULL` sur 152**. L'espace « tout en null » décrit plus haut n'y existe pas ; vérifier de quel environnement venait l'observation d'origine avant d'en tirer une conclusion (même précaution que pour la fiche 181 côté front).

## Références

- BUG-93 (même table), `docs/QUESTIONS_A_BERTRAND.md` (question #33, 🟢 depuis le 2026-07-27)
