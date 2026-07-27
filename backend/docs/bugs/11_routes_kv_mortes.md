# BUG-011 — Routes /kv mortes (KvModule non enregistré)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (code mort, pas de risque fonctionnel direct connu)
- **Domaine** : Technique
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-05 (génération de la doc API)
- **Corrigé le** : 2026-07-24

## Symptôme

Les routes `/kv` existent dans le code mais ne répondent pas / ne sont pas exposées par
l'application.

## Cause racine

`KvModule` n'est pas enregistré dans le module racine de l'application — ses routes sont donc
mortes.

## Correction

Ré-audit confirmant les deux faits :
- `grep -rn "KvModule" backend/src` : `KvModule` n'apparaît que dans son propre fichier
  (`kv.module.ts`) — jamais importé dans `app.module.ts` ni ailleurs. Une mention dans
  `digifood.module.ts` n'est qu'un commentaire d'avertissement, sans import réel.
- `grep -rn "/kv" frontend/src` : des appels `/kv/${key}` existent bien dans
  `frontend/src/utils/api.js` (`getKVData`/`setKVData`), mais ils passent par `apiFetch`, dont
  le `baseUrl` cible la fonction Edge Supabase
  (`https://${projectId}.supabase.co/functions/v1/make-server-eb31619c`), **pas** le backend
  NestJS. Le commentaire en tête de `frontend/src/api/endpoints/eventPredict.api.js` confirme
  d'ailleurs que cet ancien stockage Supabase Edge KV (`make-server-eb31619c/kv/*`) renvoyait déjà
  404 et a été remplacé par la persistance `EventPredictVersion`. Aucun code front n'appelle donc
  les routes `/kv` du backend NestJS.
- Aucun autre service backend n'importe/utilise `KvService` ou le modèle Prisma `KvStore` en
  dehors de `features/kv` lui-même (`grep -rn "kvStore\|KvStore" backend/src` ne remonte que
  `kv.service.ts`).

**Le code mort était donc mort de bout en bout** (controller HTTP, module, service). Suppression :
- Supprimé : `backend/src/features/kv/kv.module.ts`, `kv.controller.ts`, `kv.service.ts` (dossier
  `features/kv` entier). Ces routes n'étaient exposées nulle part et n'avaient aucun consommateur,
  front ou back.
- Conservé (hors périmètre de ce fix, décision volontairement non prise ici) : le modèle Prisma
  `KvStore` et sa migration (`prisma/schema.prisma`, table `KvStore`). Retirer la table serait un
  changement de schéma/migration séparé et plus risqué (perte de données potentielle) — non requis
  pour éliminer les routes HTTP mortes, donc laissé tel quel.
- Aucune entrée à retirer dans `app.module.ts` : `KvModule` n'y a jamais été importé (le bug était
  bien un oubli d'enregistrement, jamais corrigé, plutôt qu'une régression).

`npx tsc --noEmit` sur `backend/` ne remonte aucune erreur liée à cette suppression (une erreur
préexistante et sans rapport, sur un fichier `onboarding/dto/join-tenant.dto.ts` déjà supprimé par
un autre chantier en cours, a été vérifiée comme non liée à ce bug).

## Risque de régression / à surveiller

Aucun — vérifié : aucun code front ne dépendait des routes `/kv` du backend NestJS (les appels
`/kv` du front ciblent une fonction Edge Supabase distincte, déjà dépréciée).

## Références

- `docs/api/API_REFERENCE.md` (généré via `pnpm docs:api`)
