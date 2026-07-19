# BUG-86 — Suppression `Industrial` sans garde ni avertissement d'usage

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels (Configurations — Industrials)
- **Repo(s) concerné(s)** : `api-datafriday-staging` (impact visible côté `datafriday-web`)
- **Découvert le** : 2026-07-19
- **Fichiers** : `src/features/industrials/industrials.service.ts:52-57` (`remove`), `prisma/schema.prisma:838` (`MarketPrice.industrial`, `onDelete: SetNull`)

## Symptôme

Même mécanisme que [BUG-85](85_suppression_brand_displayname_sans_garde_usage.md) : supprimer un
`Industrial` référencé par des `MarketPrice` réussit silencieusement (`SetNull`, pas de crash) mais
détache `industrialId` de toutes les lignes concernées sans décompte ni avertissement.
`IndustrialDeleteDialog.vue:21-28` affiche uniquement le nom, jamais un "utilisé par N market
prices".

## Cause racine

`remove()` ne compte pas les `MarketPrice` référençant l'`Industrial` avant suppression.

## Correction

**Décision (2026-07-19)** : même arbitrage que BUG-85 — option stricte, cohérente avec le pattern
BUG-75/79/81/82/85. `IndustrialsService.remove()`
(`src/features/industrials/industrials.service.ts:71-85`) compte désormais les `MarketPrice`
dépendants (`industrialId: id`) et lève `ConflictException` (« Impossible de supprimer cet
industrial : N prix marché en dépendent encore... ») si le compte est > 0. `create`/`update`
gagnent aussi une garde anti-doublon insensible à la casse (voir BUG-87/88).

## Risque de régression / à surveiller

Revue de code uniquement dans cette session (pas de `pnpm dev` lancé) — à valider manuellement :
supprimer un `Industrial` encore référencé par un `MarketPrice` doit désormais échouer avec un
message clair (409) au lieu de détacher silencieusement `industrialId` ; supprimer une entité non
référencée doit continuer à fonctionner normalement. Voir aussi BUG-85 (même famille de risque).

## Références

- [BUG-85](85_suppression_brand_displayname_sans_garde_usage.md) — même famille sur `Brand`/`DisplayName`.
