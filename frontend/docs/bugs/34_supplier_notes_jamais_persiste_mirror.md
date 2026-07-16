# BUG-034 — `Supplier.notes` accepté par l'API mais jamais persisté (perte silencieuse)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Achats & référentiels
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/market-prices/drawers/MarketPriceCreateDrawer.vue`,
  `src/components/menu-fb/views/market-prices/drawers/MarketPriceEditSupplierDrawer.vue`

## Symptôme

Voir `api-datafriday-staging/docs/bugs/53_supplier_notes_jamais_persiste.md` (fiche complète,
cause racine 100% backend) — le champ "Notes" du dialog de création fournisseur se soumet sans
erreur mais la valeur n'est jamais retrouvée.

## Cause racine

Cf. fiche backend liée : le modèle Prisma `Supplier` n'avait pas de colonne `notes`, et le service
ne mappait pas ce champ du DTO vers l'appel Prisma, même si le DTO l'acceptait.

## Correction

Champ "Notes" ajouté côté front (port depuis une copie parallèle du repo, `old-web`) le
2026-07-16 dans le même changement qui a révélé ce bug. Rien à corriger côté front au-delà de ça —
le fix est entièrement backend (migration + mapping service), voir la fiche liée.

## Risque de régression / à surveiller

Ne fonctionnera qu'une fois la migration backend (`20260716160000_add_notes_to_supplier`)
appliquée sur l'environnement cible — vérifier avant de considérer ce champ opérationnel en
prod/staging.

## Références

- Fiche complète (cause racine + fix) : `api-datafriday-staging/docs/bugs/53_supplier_notes_jamais_persiste.md`.
