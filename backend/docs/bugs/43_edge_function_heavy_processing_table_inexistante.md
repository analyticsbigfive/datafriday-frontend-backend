# BUG-043 — Edge Function heavy-processing référence une table snake_case inexistante

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟢 Latent, code legacy jamais mis à jour avec le schéma actuel
- **Domaine** : Technique
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `supabase/functions/heavy-processing/index.ts:130-141` (`.from('fnb_sales')`, `.eq('tenant_id', ...)`)

## Symptôme

Aucun aujourd'hui — la fonction n'est appelée que par `OrchestratorService.processViaEdgeFunction`,
lui-même mort (zéro appelant).

## Cause racine

La fonction Edge interroge une table `fnb_sales`/colonnes `snake_case` qui n'existe plus dans le
schéma Prisma actuel (92 modèles `PascalCase`, ex. `SalesTransaction`) — cassée si jamais
réactivée telle quelle.

## Correction

Aucune à ce jour — à réécrire entièrement contre le schéma actuel avant toute réactivation.

## Risque de régression / à surveiller

Ne jamais réactiver `processViaEdgeFunction`/cette fonction sans la réécrire d'abord.

## Références

- `datafriday-web/docs/modules/09_TECHNIQUE.md` §"Tableau récapitulatif — bugs/gaps actifs confirmés" #5
