# BUG-052 — Quick-create Data Integration sans dédoublonnage par nom (cause racine de BUG-051)

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (prolifération de doublons à chaque ré-import, cause de BUG-051)
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : les deux (`api-datafriday-staging` + `datafriday-web`)
- **Découvert le** : 2026-07-15
- **Fichiers** : `backend/src/features/menu-items/menu-items.service.ts:240-260` (`create`), `:206-221`
  (`linkSpacesAdditive`, nouveau) ; `backend/src/features/menu-items/dto/create-menu-item.dto.ts`
  (`dedupeByName`) ; `frontend/src/components/integration/wizard/StepMapMenuItems.vue:1688-1724`
  (`submitQuickCreate`)

## Symptôme

Root cause n°2 identifiée en creusant [BUG-051](51_spacemenuitem_orphelins_apres_soft_delete_menuitem.md) :
le bouton "quick-create" du wizard Data Integration (étape mapping produits) appelle
`POST /menu-items` (le `create()` générique du builder manuel) à chaque produit Weezevent non
mappé. Cet endpoint ne vérifie jamais si un `MenuItem` du même nom existe déjà pour le tenant — un
ré-import ou un re-mapping du même produit recrée donc un nouveau `MenuItem` à chaque fois. C'est
ce mécanisme qui a produit les 1422 lignes `SpaceMenuItem` orphelines nettoyées dans BUG-051
("Café" recréé 3+ fois, "PIZZA jambon - part" recréé 3 fois, etc.).

## Cause racine

`MenuItemsService.create()` (`menu-items.service.ts:240`) insère toujours un nouveau `MenuItem`
sans recherche préalable par nom. `MappingsService.resurrectSoftDeletedMenuItems`
(`mappings.service.ts:575-591`) ne réactive un item soft-deleted que si le **même id** est
re-mappé — elle ne fait aucun rapprochement par nom entre un nouveau produit à mapper et un
`MenuItem` déjà existant portant le même nom.

## Correction

Appliquée le 2026-07-15, scope volontairement limité au flux quick-create (le builder manuel
`/menu-items` classique garde son comportement historique — créer un doublon intentionnel du même
nom reste possible en dehors de la Data Integration) :

- `CreateMenuItemDto.dedupeByName` (nouveau champ optionnel, `create-menu-item.dto.ts`) : si
  `true`, `MenuItemsService.create()` cherche d'abord un `MenuItem` actif du tenant dont le nom
  correspond (trim + insensible à la casse). S'il existe, il est **réutilisé** au lieu d'être
  recréé : aucun nouveau `MenuItem` n'est inséré.
- `MenuItemsService.linkSpacesAdditive()` (nouvelle méthode) associe l'item réutilisé à l'espace
  demandé sans toucher à ses autres associations — contrairement à `syncSpaceLinks` qui est en
  sémantique de **remplacement total** (documenté dans son propre commentaire) et aurait
  désassocié l'item de tout autre espace auquel il était déjà rattaché. `linkSpacesAdditive` fait
  un `upsert` par espace, sans écraser un prix déjà réglé sur un lien existant.
- `StepMapMenuItems.vue::submitQuickCreate()` envoie désormais `dedupeByName: true` dans le
  payload — c'est le seul appelant modifié ; le formulaire manuel de création d'article
  (`Menu & recettes`) et le bulk-create (`POST /menu-items/bulk`) restent inchangés.
- Validé par un test isolé (données créées et supprimées par le script lui-même, aucun impact sur
  les données réelles) : la recherche par nom retrouve bien l'item existant, l'upsert du lien
  espace est idempotent et ne duplique ni n'écrase un prix déjà réglé.

## Risque de régression / à surveiller

- Le `POST /menu-items/bulk` (`bulkCreateAndMap` côté wizard, utilisé pour le mapping en masse)
  passe par `MenuItemsService.bulkCreate()`, un chemin **entièrement différent** de `create()` :
  il n'a pas non plus de dédoublonnage par nom, **et** n'appelle jamais `syncSpaceLinks` — les
  items créés en masse ne sont donc associés à AUCUN espace au moment de leur création. Ce chemin
  n'a pas été corrigé ici (pas dans le périmètre demandé) mais partage la même famille de
  problème ; à traiter dans un ticket dédié si le volume de mapping en masse pose souci.
  `bulkCreate` : `menu-items.service.ts:355`.
- Vérifier qu'un utilisateur qui crée volontairement deux articles de menu du même nom via le
  builder manuel (`Menu & recettes`, pas la Data Integration) n'est pas affecté — le flag
  `dedupeByName` n'est envoyé que par `submitQuickCreate`.
- Reproduire pour non-régression : mapper un produit Weezevent vers un nouvel article via
  quick-create (ex. "Test Café"), noter son id, puis re-tenter un quick-create avec exactement le
  même nom pour un autre produit → vérifier qu'aucun nouveau `MenuItem` n'est créé et que l'espace
  demandé est bien ajouté aux `SpaceMenuItem` de l'item existant sans perdre ses autres espaces.

## Références

- [BUG-051](51_spacemenuitem_orphelins_apres_soft_delete_menuitem.md) — symptôme aval (lignes
  `SpaceMenuItem` orphelines) que ce bug alimentait à chaque ré-import.
- [BUG-004](04_mappings_orphelins_save_builder.md) — autre mécanisme de mapping Data Integration
  qui devient orphelin silencieusement (cause différente).
