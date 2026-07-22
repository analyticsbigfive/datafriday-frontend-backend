# BUG-038 — Le clonage de rôle métier ne resynchronise jamais les permissions après création

- **Statut** : 🟢 Corrigé — propagation automatique (décidé par l'utilisateur le 2026-07-22, cf. question #24)
- **Sévérité** : 🟢 Faible (comportement voulu, mais piégeux si non documenté)
- **Domaine** : Auth & onboarding (RBAC)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 · **Documenté le** : 2026-07-20 (emmanuel) · **Automatisé le** : 2026-07-22
- **Fichiers** : `permission-catalog.ts` (`ensureSystemPermissionCatalog` + `grantNewPermissionsToExistingRoles`) ; `prisma/backfill-rbac.ts` (`ADDITIVE_ROLE_GRANTS` supprimé) ; `package.json` (`rbac:backfill`)

## Symptôme

Ajouter une permission au catalogue et l'attribuer à "Chef" dans `SYSTEM_ROLES` ne la propage à
AUCUN tenant existant — seulement aux tenants créés après ce changement.

## Cause racine

Les rôles métier sont clonés depuis `SYSTEM_ROLES` **à la création du tenant seulement** — voir
aussi [[project_rbac_business_roles_alignment]] : "gotcha clone create-only". Ce n'est pas un bug
de logique, mais l'absence de mécanisme de resync le rend piégeux si on l'ignore.

## Correction

**2026-07-20** — un mécanisme additif manuel existait déjà (`prisma/backfill-rbac.ts`, table curée
`ADDITIVE_ROLE_GRANTS` + `npm run rbac:backfill`), mais il manquait d'être documenté et rendu
visible : un commentaire de rappel avait été ajouté au-dessus de `SYSTEM_ROLES`
(`permission-catalog.ts`) pointant vers la procédure manuelle. Passage à 🟡, arbitrage ouvert
(question #24) sur l'automatisation.

**2026-07-22** — décision de l'utilisateur (question #24) : **automatiser sans curation**.
Propager systématiquement toute permission nouvellement créée aux tenants existants ; à l'admin de
la retirer ensuite via l'écran Rôles s'il ne la veut pas sur un tenant donné.

Ce qui rend cette automatisation sûre **sans** liste curée ni resync aveugle : dans
`ensureSystemPermissionCatalog`, la branche qui crée une permission en base pour la toute première
fois (`prisma.permission.create`, code jamais vu avant) est un signal fiable à 100% — un code qui
vient tout juste d'être créé n'a **jamais** pu être retiré par un admin auparavant, puisqu'il
n'existait pas. On peut donc l'accorder automatiquement partout sans risquer d'écraser une
personnalisation.

Implémentation : `ensureSystemPermissionCatalog` (`permission-catalog.ts`) collecte les codes
fraîchement créés lors de son passage, puis `grantNewPermissionsToExistingRoles` les accorde aux
rôles métier **déjà existants** (tous tenants confondus, recherchés par `name` + `isSystem`) qui
les incluent par défaut dans `SYSTEM_ROLES` — additif et idempotent (`skipDuplicates`), comme
l'était l'ancien mécanisme curé. `ADDITIVE_ROLE_GRANTS` est supprimé : plus rien à maintenir à la
main. Un dev qui ajoute une permission par défaut à un rôle métier dans `SYSTEM_ROLES` n'a donc plus
aucune étape supplémentaire à faire — la propagation aux tenants existants se fait automatiquement
au prochain `npm run rbac:backfill` (ou seed).

## Risque de régression / à surveiller

- Ce mécanisme ne doit **jamais** être étendu à un resync complet non curé des permissions déjà
  existantes (celles présentes en base avant ce changement) : ça écraserait les personnalisations
  de rôles faites par les admins (permissions retirées volontairement réapparaîtraient). Il ne
  s'applique **qu'aux codes tout juste créés** — c'est précisément ce qui le rend sûr.
- `grantNewPermissionsToExistingRoles` retrouve les rôles par `name` (pas par `tenantId`) : si un
  tenant a renommé un rôle métier système, il ne recevra pas la propagation automatique pour ce
  rôle (à surveiller si le renommage de rôle système devient possible).

## Références

- `datafriday-web/docs/modules/08_AUTH_ONBOARDING.md` §"Récapitulatif — bugs actifs confirmés" #8
- Question #24, `datafriday-web/docs/QUESTIONS_A_BERTRAND.md` (déplacée dans "Questions résolues")
