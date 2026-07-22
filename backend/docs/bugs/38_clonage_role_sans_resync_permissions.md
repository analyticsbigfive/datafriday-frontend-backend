# BUG-038 — Le clonage de rôle métier ne resynchronise jamais les permissions après création

- **Statut** : 🟡 Documenté (procédure en place ; automatisation en arbitrage, cf. question #24)
- **Sévérité** : 🟢 Faible (comportement voulu, mais piégeux si non documenté)
- **Domaine** : Auth & onboarding (RBAC)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 · **Traité le** : 2026-07-20 (emmanuel)
- **Fichiers** : `permission-catalog.ts:250-296` (clone create-only) ; `prisma/backfill-rbac.ts:38-76` (backfill additif) ; `package.json` (`rbac:backfill`)

## Symptôme

Ajouter une permission au catalogue et l'attribuer à "Chef" dans `SYSTEM_ROLES` ne la propage à
AUCUN tenant existant — seulement aux tenants créés après ce changement.

## Cause racine

Les rôles métier sont clonés depuis `SYSTEM_ROLES` **à la création du tenant seulement** — voir
aussi [[project_rbac_business_roles_alignment]] : "gotcha clone create-only". Ce n'est pas un bug
de logique, mais l'absence de mécanisme de resync le rend piégeux si on l'ignore.

## Correction

**Le mécanisme additif existe déjà** (il manquait seulement d'être documenté et rendu visible).
`prisma/backfill-rbac.ts` (commande `npm run rbac:backfill`) est **idempotent et purement additif**
(« ne retire jamais rien », l.8-9, 36). Sa table curée `ADDITIVE_ROLE_GRANTS` (l.38-40) sert
précisément à poser de nouveaux codes du catalogue sur des rôles métier **déjà créés**, sans écraser
les personnalisations admin. Le resync aveugle est **volontairement évité** : il ré-ajouterait une
permission qu'un admin a retirée à dessein — d'où la liste curée plutôt qu'un diff automatique.

**Procédure à suivre après toute évolution de `SYSTEM_ROLES`** (permission par défaut ajoutée à un
rôle métier) :
1. Ajouter le nouveau code sous le rôle concerné dans `ADDITIVE_ROLE_GRANTS` (`prisma/backfill-rbac.ts`).
2. Lancer `npm run rbac:backfill` — additif, sûr avant ou après déploiement, ne touche pas
   MANAGER/STAFF/VIEWER.

Ce qui a été fait le 2026-07-20 : un **commentaire de rappel** a été ajouté au-dessus de
`SYSTEM_ROLES` (`permission-catalog.ts`) pointant vers cette procédure — c'était l'absence de ce
rappel qui faisait du comportement (voulu) un « piège ».

**En arbitrage** (question #24 de `datafriday-web/docs/QUESTIONS_A_BERTRAND.md`) : faut-il
**automatiser** ce backfill (au déploiement / au boot) plutôt que de le laisser manuel ? La procédure
manuelle documentée ci-dessus est l'intérim retenu. Passage à 🟢 conditionné à cet arbitrage.

## Risque de régression / à surveiller

- Ne **jamais** transformer le backfill en resync complet non curé : cela écraserait les
  personnalisations de rôles faites par les admins (permissions retirées volontairement réapparaîtraient).
- Toute évolution du catalogue de permissions reste à suivre de la procédure ci-dessus tant que
  l'automatisation (#24) n'est pas tranchée.

## Références

- `datafriday-web/docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #8
