# BUG-043 — Edge Function heavy-processing référence une table snake_case inexistante

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Latent, code legacy jamais mis à jour avec le schéma actuel
- **Domaine** : Technique
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `supabase/functions/heavy-processing/index.ts:130-141` (`.from('fnb_sales')`, `.eq('tenant_id', ...)`)

## Symptôme

Aucun aujourd'hui — la fonction n'était appelée que par `OrchestratorService.processViaEdgeFunction`,
lui-même mort (zéro appelant, confirmé par recherche exhaustive dans `backend/src`: ni
`processViaEdgeFunction` ni `OrchestratorService` n'étaient référencés en dehors du module
`orchestrator` lui-même).

## Cause racine

La fonction Edge interroge une table `fnb_sales`/colonnes `snake_case` qui n'existe plus dans le
schéma Prisma actuel (92 modèles `PascalCase`, ex. `SalesTransaction`) — cassée si jamais
réactivée telle quelle.

## Correction

**Correction appliquée** — suppression du code mort plutôt que réécriture, puisqu'il n'avait
aucun appelant :
- `OrchestratorService.processViaEdgeFunction` supprimée de `orchestrator.service.ts`.
- `supabase/functions/heavy-processing/index.ts` supprimé (répertoire `heavy-processing/`
  entièrement retiré).
- Le `case 'edge'` de `OrchestratorService.processSync` route désormais vers
  `processViaQueue` (c'était déjà le comportement de fallback historique en cas d'échec de
  l'Edge Function), avec un commentaire explicite renvoyant à BUG-43.

## Risque de régression / à surveiller

Le chemin `strategy: 'edge'` (déclenché pour les datasets > 50 000 items dans `decideStrategy`)
passe maintenant par la queue au lieu de l'Edge Function — vérifier que la queue absorbe
correctement ce volume si ce seuil est atteint en production. Ne jamais réintroduire un appel à
une Edge Function 'heavy-processing' sans réécrire son accès aux données contre le schéma Prisma
actuel.

## Références

- `datafriday-web/docs/modules/09_TECHNIQUE.md` §"Tableau récapitulatif — bugs/gaps actifs confirmés" #5
