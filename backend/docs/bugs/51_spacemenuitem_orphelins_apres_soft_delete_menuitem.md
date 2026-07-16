# BUG-051 — `SpaceMenuItem` orphelins après soft-delete d'un `MenuItem` (espace Auxerre : 89% des lignes mortes)

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (dette de données silencieuse, croît à chaque ré-import Data Integration)
- **Domaine** : Intégrations & ventes / Espaces & builder
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15
- **Fichiers** : `src/features/menu-items/menu-items.service.ts:1330-1345` (`remove`), `:173-198`
  (`syncSpaceLinks`), `:240` (`create`) ; `src/features/mappings/mappings.service.ts:575-591`
  (`resurrectSoftDeletedMenuItems`), `:602-625` (`attachSpaceToMenuItems`) ;
  `src/features/space-menus/space-menus.service.ts:76-310` (`getShopMenu`) ;
  `src/features/weezevent/weezevent.controller.ts:298-339` (`/weezevent/integrity`)

## Symptôme

Tâche initiale : vérifier si des Menu Items de l'espace **Auxerre** (`cmovsjbiz01lzvwyn30wweqpf`,
tenant `cmovsic1g01lvvwyndt2qqwkw`) ont un **Prix unitaire null** lors de la Data Integration.

Diagnostic direct sur la base (lecture seule, requêtes Prisma ad hoc) :

- 368 lignes `SpaceMenuItem` (override de prix par espace) pour Auxerre.
- **327 (89%)** pointent vers un `MenuItem` **soft-deleted** (`deletedAt` renseigné) — ce sont des
  doublons créés par des ré-imports/ré-mappings successifs (ex. "Café" recréé 3+ fois, "PIZZA
  jambon - part" recréé 3 fois, "CREPE AU SUCRE" recréé 2 fois, etc.).
- Seules **41 lignes** pointent vers un `MenuItem` actif — et **aucune** des 41 n'a de prix
  résolu à 0/null aujourd'hui. Aucune `MenuAssignment` active (tenant-wide) ne référence non plus
  un `MenuItem` supprimé.

**Donc pas de bug visible côté utilisateur actuellement pour Auxerre** — mais la cause qui a
produit ces 327 lignes mortes est un vrai bug qui continuera à s'aggraver à chaque nouvel import,
et une lecture non filtrée existe déjà dans le code (`getShopMenu`) qui ne demande qu'à
l'exposer dès qu'une `MenuAssignment` pointera un jour vers un item supprimé.

## Cause racine

1. **`MenuItemsService.remove()`** (`menu-items.service.ts:1330-1345`) soft-delete le `MenuItem`
   et purge explicitement les `ProductMapping` qui le référencent (le commentaire en ligne
   1335-1338 documente l'invariant *"un MenuItem soft-deleted ne doit jamais rester référencé par
   un mapping Weezevent"*) — **mais ne touche jamais aux `SpaceMenuItem`**. Le seul endroit qui
   nettoie `SpaceMenuItem` est `syncSpaceLinks` (ligne 173-198), qui ne s'exécute que lors d'une
   ré-assignation manuelle d'espaces sur un item existant, jamais depuis `remove()`.
2. Le wizard de mapping (Data Integration, étape "quick-create") crée un nouveau `MenuItem` à
   chaque produit non mappé via `create()` (`menu-items.service.ts:240`), **sans dédoublonnage par
   nom** — c'est le mécanisme qui produit les doublons ("Café" x3, etc.) à chaque nouvel
   import/re-mapping. `MappingsService.resurrectSoftDeletedMenuItems`
   (`mappings.service.ts:575-591`) ne réactive un `MenuItem` soft-deleted que si le **même id**
   est re-mappé — il ne fusionne jamais les doublons ni ne nettoie les `SpaceMenuItem` des
   anciennes versions abandonnées.
3. `GET /weezevent/integrity` (`weezevent.controller.ts:298-339`) vérifie déjà les
   `ProductMapping` orphelins pointant vers un `MenuItem` supprimé, mais ne vérifie **pas** les
   `SpaceMenuItem` orphelins — ce diagnostic n'est donc pas auto-détecté par l'outil existant.
4. Risque latent distinct : `SpaceMenusService.getShopMenu()`
   (`space-menus.service.ts:76-310`, résolution `SpaceElement → MenuAssignment → MenuItem`) ne
   filtre `deletedAt` nulle part dans le select ni dans le post-traitement (lignes 241-310). Si une
   `MenuAssignment` active venait à référencer un `MenuItem` supprimé (ce qui n'est pas le cas
   aujourd'hui, vérifié tenant-wide), cet endpoint afficherait l'item mort — souvent avec
   `basePrice = 0` — comme un article normal du menu de l'espace, ce qui donnerait exactement le
   symptôme "Prix unitaire null" observé côté espace.

## Correction

Appliquée le 2026-07-15 :

- `MenuItemsService.remove()` (`menu-items.service.ts:1330-1353`) purge désormais aussi les
  `SpaceMenuItem` du `MenuItem` soft-deleted, symétriquement à ce qui était déjà fait pour
  `ProductMapping`.
- `GET /weezevent/integrity` (`weezevent.controller.ts:298-350`) expose un nouveau compteur
  `spaceLinksToDeletedItems` (même logique que `mappingsToDeletedItems`), qui entre dans le calcul
  de `healthy`.
- `SpaceMenusService.getShopMenu()` (`space-menus.service.ts:76-236`) filtre désormais
  `menuAssignments` avec `where: { menuItem: { deletedAt: null } }` — défense en profondeur même
  si aucun cas actif n'a été trouvé au diagnostic.
- Backfill exécuté : `scripts/backfill-spacemenuitem-orphans.ts` (dry-run par défaut, `--apply`
  pour supprimer, `--tenant=<id>` pour scoper). Exécution `--apply` sur l'ensemble des tenants :
  **1422 lignes `SpaceMenuItem` orphelines supprimées** (327 sur Auxerre, 831 + 126 + 104 + 33 + 1
  réparties sur 5 autres espaces). Reconfirmé après coup : 0 ligne orpheline restante, tous
  tenants confondus.

Cause plus profonde (prolifération des doublons elle-même) traitée séparément dans
[BUG-052](52_quickcreate_sans_dedoublonnage_par_nom.md) : le quick-create du wizard de mapping ne
recrée plus de doublon par nom depuis sa correction.

## Risque de régression / à surveiller

- Surveiller `GET /weezevent/integrity` (`spaceLinksToDeletedItems`) périodiquement — doit rester
  à 0 désormais que `remove()` nettoie systématiquement ; une remontée > 0 indique un chemin de
  suppression qui contourne encore `MenuItemsService.remove()`.
- Reproduire pour non-régression : mapper un produit Weezevent vers un `MenuItem` existant d'un
  espace, le supprimer (soft-delete) → vérifier que la ligne `SpaceMenuItem` disparaît
  immédiatement (plus besoin d'attendre un backfill).
- Le backfill (`scripts/backfill-spacemenuitem-orphans.ts`) a supprimé des lignes en base sans
  soft-delete intermédiaire (hard delete direct, filtré strictement sur
  `menuItem.deletedAt IS NOT NULL`) — script conservé dans `scripts/` pour ré-exécution ponctuelle
  si de nouveaux orphelins réapparaissaient via un chemin non couvert.
- Le quick-create sans dédoublonnage par nom (cause racine n°2, non traitée) peut encore produire
  de nouveaux doublons — à surveiller si le volume reproduit une situation proche des 1422 lignes
  initiales.

## Références

- [BUG-004](04_mappings_orphelins_save_builder.md) — mécanisme différent (regénération
  `SpaceElement.id`) mais même famille de symptôme : mappings Data Integration qui deviennent
  orphelins silencieusement.
- [BUG-007](07_prix_fnb_weezevent_absent.md) — autre cause historique de "prix absent" côté
  catalogue Weezevent (déjà corrigée), sans lien direct avec celle-ci.
- `docs/data-integration-pipeline.md`, `docs/FEATURE_MENUITEM_PRICE_FROM_WEEZEVENT.md`.
