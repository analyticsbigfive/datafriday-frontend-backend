# Questions à Bertrand — tracker de clarification

> On n'a pas de base de code auto-porteuse : la compréhension fonctionnelle réelle passe par
> Bertrand (review, test, validation). Ce fichier évite que chacun tranche seul dans son coin une
> incompréhension du code ou d'une fonctionnalité — ce qui est la source la plus fréquente de bugs
> et de conflits sur ce projet (voir [`docs/bugs/00_INDEX.md`](bugs/00_INDEX.md), plusieurs bugs
> viennent de deux devs ayant chacun implémenté sa propre interprétation de la même règle — ex.
> le gating Team, [BUG côté front](bugs/) vs comportement attendu).

## Comment l'utiliser

1. Bloqué sur une incompréhension (code, règle métier, comportement attendu) → ajouter une ligne
   ci-dessous, statut 🔴.
2. Poser la question à Bertrand.
3. Une fois répondu : mettre à jour la doc canonique concernée (page de module dans
   [`docs/modules/`](modules/00_INDEX.md), [`docs/adr/`](adr/00_INDEX.md), ou
   [`docs/bugs/`](bugs/00_INDEX.md) si la réponse révèle un bug) — **et le code si la réponse
   implique un renommage/commentaire/refactor** — puis lier la mise à jour ici et passer le
   statut à 🟢.
4. **Ne jamais merger un code qui repose sur une hypothèse encore marquée 🔴.**

Même mécanique pour une fonctionnalité neuve : confronter le cahier des charges au code existant,
lister ici ce qui reste ambigu, trancher avec Bertrand avant d'écrire le code définitif.

## Questions ouvertes

| # | Question | Domaine | Posée par | Date | Statut | Repliée dans |
|---|---|---|---|---|---|---|
| — | _(aucune question pour l'instant — ajouter une ligne au premier blocage)_ | | | | | |

## Questions résolues

| # | Question | Réponse (résumé) | Repliée dans |
|---|---|---|---|
| 1 | Sur `/suppliers`, le formulaire front rend `email`, `phone`, `address`, `city`, `postcode` obligatoires, alors que le modèle Prisma `Supplier` et `CreateSupplierDto` ne rendaient obligatoire que `name`. Faut-il aligner le front sur le backend ou durcir le backend ? | Décidé par l'utilisateur le 2026-07-16 : durcir le backend pour matcher le front. `contactName` inclus dans le même durcissement (également obligatoire côté front, oublié dans la question initiale). Schema Prisma + `CreateSupplierDto` mis à jour (email/tel/address/city/postcode/contactName non-optionnels) ; migration écrite avec backfill des lignes existantes (3 à 6 lignes selon le champ, sur 15 fournisseurs) et **appliquée le 2026-07-16 via `prisma migrate deploy`** (conformément à [ADR-0002 (backend)](../../backend/docs/adr/0002_migrations_manuelles_jamais_plateforme.md), sur autorisation explicite de l'utilisateur) contre la base pointée par `backend/.env` — vérifié en base (`\d "Supplier"` : colonnes `email/tel/address/city/postcode/contactName` en `NOT NULL`). | `backend/prisma/schema.prisma` (model Supplier), `backend/src/features/suppliers/dto/create-supplier.dto.ts`, `backend/prisma/migrations/20260716170000_supplier_required_contact_fields/` |
