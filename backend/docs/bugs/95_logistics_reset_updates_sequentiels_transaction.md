# BUG-95 — `reset` logistique : updates StockLevel un-par-un dans la transaction 30s

- **Statut** : 🟢 Corrigé (en code, non déployé)
- **Sévérité** : 🟡 Mineur/perf (risque timeout transaction sur gros espaces)
- **Domaine** : Stock (Logistique)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/features/logistics/logistics.service.ts:1376-1381, 1406-1417` (avant fix)

## Symptôme

`POST /logistics/:spaceId/reset` exécutait deux boucles `for … await tx.stockLevel.update()` (une par ligne carry, une par ligne comptée) **dans** la transaction interactive — d'où le `timeout: 30000` posé en garde-fou. Sur un espace à centaines de niveaux, chaque update est un aller-retour DB séquentiel (DB distante Supabase ≈ dizaines de ms l'unité).

## Cause racine

Updates par-ligne au lieu d'un bulk : les valeurs diffèrent par ligne, donc pas d'`updateMany` possible — mais Postgres sait faire `UPDATE … FROM (VALUES …)`.

## Correction

2026-07-18 : les deux boucles remplacées par un `tx.$executeRaw` unique `UPDATE "StockLevel" … FROM (VALUES …)` chacune (garde `tenantId` dans le WHERE ; `COALESCE(v.upp, sl."unitsPerPack")` préserve la sémantique « ne toucher unitsPerPack que si fourni » ; `updatedAt = NOW()` maintenu, que Prisma posait implicitement).

## Risque de régression / à surveiller

Parité valeurs : `packedUnits` Int (trunc), `looseUnits` float8. La fenêtre de course documentée du reset (`:1256-1259`) est inchangée (voir fiche 102). Vérifier en staging un reset sur espace réel : mêmes niveaux résultants, durée transaction en forte baisse.

## Références

- Fiche 102 (race reset / simulateSale, ⚪)
