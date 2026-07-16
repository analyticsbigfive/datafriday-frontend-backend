# BUG-053 — `Supplier.notes` accepté par l'API mais jamais persisté (perte silencieuse)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (perte de donnée non bloquante, mais silencieuse)
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/features/suppliers/dto/create-supplier.dto.ts`,
  `src/features/suppliers/dto/update-supplier.dto.ts`, `src/features/suppliers/suppliers.service.ts`,
  `prisma/schema.prisma` (modèle `Supplier`)

## Symptôme

Un utilisateur qui crée ou édite un fournisseur (dialog "Nouveau fournisseur" dans
`MarketPriceCreateDrawer.vue` / `MarketPriceEditSupplierDrawer.vue`, côté `datafriday-web`) et
remplit le champ "Notes" ne reçoit aucune erreur, l'opération réussit — mais les notes ne sont
jamais retrouvées ensuite : elles disparaissent silencieusement, comme si elles n'avaient jamais
été saisies.

## Cause racine

`CreateSupplierDto`/`UpdateSupplierDto` acceptaient déjà un champ `notes?: string` (validé par
`class-validator`), et le frontend l'envoyait bien dans le payload `POST /suppliers` /
`PATCH /suppliers/:id`. Mais :

1. Le modèle Prisma `Supplier` (`prisma/schema.prisma:774`) n'avait **pas** de colonne `notes`.
2. `SuppliersService.create()` (`suppliers.service.ts:17-35`) et `.update()` (`:88-104`)
   construisaient explicitement l'objet `data` champ par champ pour l'appel Prisma — `notes`
   n'y figurait pas, donc même reçu et validé, il était simplement ignoré avant d'atteindre la
   base.

Un DTO qui accepte un champ ne garantit pas qu'il soit persisté : chaque champ doit être mappé
explicitement dans le service vers l'objet `data` de Prisma. C'est ce mapping qui manquait ici.

## Correction

- Ajout de `notes String?` au modèle `Supplier` (`prisma/schema.prisma`).
- Migration `prisma/migrations/20260716160000_add_notes_to_supplier/migration.sql`
  (`ALTER TABLE "Supplier" ADD COLUMN "notes" TEXT;`).
- `SuppliersService.create()` : ajout de `notes: createSupplierDto.notes` dans l'objet `data`.
- `SuppliersService.update()` : ajout de
  `if (updateSupplierDto.notes !== undefined) updateData.notes = updateSupplierDto.notes;`.

Trouvé en auditant, à la demande de l'utilisateur, les payloads envoyés au backend par du code
frontend récupéré depuis une copie parallèle du repo (`old-web` / `datafriday-web` historique
disjoint) — voir la fiche miroir côté frontend, [BUG-034](../../../frontend/docs/bugs/34_supplier_notes_jamais_persiste_mirror.md).

## Risque de régression / à surveiller

- Migration à appliquer sur l'environnement cible (`npx prisma migrate deploy`) avant que le champ
  fonctionne réellement en prod/staging — sans ça, la requête Prisma échouera avec
  `Unknown argument 'notes'` dès que le champ sera envoyé (cf. BUG-047, même famille de panne :
  Prisma Client désynchronisé du schéma).
- Pas de test automatisé ajouté — vérification manuelle recommandée : créer un fournisseur avec
  des notes, recharger, confirmer qu'elles sont bien affichées.
- Vérifier si un écran d'édition/affichage fournisseur affiche déjà (ou devrait afficher) ce champ
  `notes` en lecture — au moment du fix, seuls les formulaires de création l'exposent en saisie.

## Références

- Fiche miroir frontend : [BUG-034](../../../frontend/docs/bugs/34_supplier_notes_jamais_persiste_mirror.md).
- Bug de même famille (désynchronisation Prisma Client / schéma) : [BUG-047](47_prisma_client_desync_apres_switch_branche.md).
