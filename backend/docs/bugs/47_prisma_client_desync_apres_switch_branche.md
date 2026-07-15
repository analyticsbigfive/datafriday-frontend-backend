# BUG-047 — Prisma Client désynchronisé du schéma après switch de branche (`Unknown argument` sur un champ existant)

- **Statut** : 🟢 Corrigé (ponctuel, environnement dev)
- **Sévérité** : 🟡 Mineur (bloquant en dev tant que non résolu, mais aucun impact code/prod — le
  schéma et la base étaient corrects, seul le client généré était périmé)
- **Domaine** : Technique (Prisma / workflow dev)
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : aucun — `node_modules/.prisma/client` généré, pas du code versionné

## Symptôme

`PATCH /api/v1/menu-items/:id` échouait en 500 avec :

```
Invalid `this.prisma.menuItem.update()` invocation ...
Unknown argument `typeId`. Available options are marked with ?.
```

`typeId` est un champ `MenuItem` ancien et stable (`schema.prisma`, présent depuis l'introduction du
modèle), la relation `productType` est correctement déclarée (`@relation(fields: [typeId], ...)`).
Le schéma sur disque était valide — seul le Prisma Client chargé par le process backend en cours
d'exécution refusait le champ.

Repro : dev server backend démarré, un `git checkout`/merge change l'état de `prisma/schema.prisma`
sur le disque (ici : passage `fix/menu-item-inventory-kitchen-type` → merge sur `staging`, dans le
cadre de [BUG-046](46_inventoryunit_jamais_persiste_menuitem.md)) sans relancer
`prisma generate` ni redémarrer le process — le client Prisma déjà chargé en mémoire/sur disque
reste celui généré pour l'ancien état du schéma.

## Cause racine

Le Prisma Client (`@prisma/client`) est du code généré, versionné nulle part — il doit être
régénéré (`prisma generate`) à chaque changement de `schema.prisma`, puis le process qui l'importe
doit redémarrer pour charger la nouvelle version. Aucune des deux étapes n'avait été refaite après
le changement de schéma (ajout de `MenuItem.inventoryUnit`, migration
`20260715180000_add_inventory_unit_to_menu_item`) : la migration SQL avait été appliquée en base,
mais pas la régénération du client — d'où un client obsolète qui ne reconnaît plus la forme
attendue de `MenuItemUpdateInput` (y compris des champs sans rapport avec le changement, comme
`typeId`, symptôme d'une désync plus large plutôt que d'un champ spécifique cassé).

## Correction

`cd backend && npx prisma migrate deploy && npx prisma generate`, puis redémarrage manuel du
serveur dev (fait par l'utilisateur — ni la migration ni un restart de process ne sont exécutés
automatiquement dans ce repo). `migrate deploy` a confirmé que seule la migration `inventoryUnit`
était en attente (49/50 déjà appliquées) : la base n'avait pas de dérive, uniquement le client
généré.

Pas de changement de code — ce ticket documente le symptôme et la procédure de résolution pour
qu'un futur diagnostic (agent ou humain) reconnaisse immédiatement `Unknown argument` sur un champ
par ailleurs valide comme un client Prisma périmé, plutôt que de chercher une régression dans le
schéma ou le service.

## Risque de régression / à surveiller

- Tout changement de `schema.prisma` doit être suivi de `prisma generate` **et** d'un redémarrage
  du process backend avant test — sinon même symptôme.
- Un `git checkout`/merge/rebase qui modifie `schema.prisma` en local pendant qu'un dev server
  tourne peut recréer ce désync sans qu'aucune commande Prisma n'ait été explicitement lancée par
  l'utilisateur.

## Références

- [BUG-046](46_inventoryunit_jamais_persiste_menuitem.md) — le changement de schéma qui a déclenché
  ce désync.
