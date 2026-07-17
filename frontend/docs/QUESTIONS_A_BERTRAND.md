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
| 2 | Import CSV `/events` : les colonnes `performerName`/`sponsor`/`openingActName`/`allSessions` sont proposées au mapping mais aucun champ `Event` ne les stocke (root cause probable : copiées depuis `EventsImportWizard.vue`, code mort du sous-arbre `appCopy.vue`, jamais adaptées au vrai `CreateEventDto`). Ajouter ces colonnes au schéma `Event`, ou les retirer du mapping CSV ? | Événements | Audit domaine Événements (Claude, session 2026-07-17) | 2026-07-17 | 🔴 | [`bugs/136_csvimportdrawer_champs_hors_dto_400_garanti.md`](bugs/136_csvimportdrawer_champs_hors_dto_400_garanti.md) |
| 3 | Suppression `EventType`/`EventCategory` : cascade silencieuse (via `onDelete: Cascade`) vers catégories/sous-catégories/events-teams orphelins, sans garde "N éléments en dépendent, confirmer ?". Le même pattern existe déjà sans garde sur `ProductType`/`ComponentType` (vérifié dans le code) — ajouter un garde-fou isolément sur Events créerait une incohérence UX avec ces autres taxonomies. Garde-fou transverse à toutes les taxonomies, ou statu quo assumé ? | Événements (transverse) | Audit domaine Événements (Claude, session 2026-07-17) | 2026-07-17 | 🔴 | [`../../api-datafriday-staging/docs/bugs/75_eventtype_eventcategory_delete_cascade_sans_garde.md`](../../api-datafriday-staging/docs/bugs/75_eventtype_eventcategory_delete_cascade_sans_garde.md) |
| 4 | `Team` n'a aucune contrainte `@@unique` en base (contrairement à `EventType`/`EventCategory`/`EventSubcategory`) — le check anti-doublon applicatif est insensible à la casse (`mode: 'insensitive'`), qu'une contrainte DB standard ne reproduit pas nativement. Ajouter la contrainte (et avec quelle sémantique de casse) ? | Événements | Audit domaine Événements (Claude, session 2026-07-17) | 2026-07-17 | 🔴 | [`../../api-datafriday-staging/docs/bugs/70_team_duplicate_toctou_sans_unique_index.md`](../../api-datafriday-staging/docs/bugs/70_team_duplicate_toctou_sans_unique_index.md) |
| 5 | `EventPredictVersion.create()` ne vérifie pas que `eventId` (pris depuis l'URL) existe/appartient au tenant — orphelines possibles sur id erroné/typo. Ajouter la vérification, seule ou avec le nettoyage plus large déjà noté (versions orphelines après suppression d'un Event) ? | Prévision | Audit domaine Événements (Claude, session 2026-07-17) | 2026-07-17 | 🔴 | [`../../api-datafriday-staging/docs/bugs/76_predictversion_create_eventid_non_verifie.md`](../../api-datafriday-staging/docs/bugs/76_predictversion_create_eventid_non_verifie.md) |
| 6 | `/event-categories` (drawer inline, avec édition) et `EventCategoryDialog.vue` (dialog partagé "quick-add", création seule, utilisé pendant un autre flux) sont deux implémentations distinctes de la création de catégorie — cause racine des BUG-130/131 (`hasHomeTeam` géré différemment aux deux endroits). Garder les deux avec un garde-fou (payload partagé/factorisé) pour éviter une nouvelle divergence de champ, ou unifier sur un seul composant (ajouter un mode édition au dialog partagé) ? | Événements | Audit domaine Événements (Claude, session 2026-07-17) | 2026-07-17 | 🔴 | [`bugs/145_eventcategorielist_duplication_creation_categorie.md`](bugs/145_eventcategorielist_duplication_creation_categorie.md) |
| 7 | `EventFormDrawer.vue` : aucune validation croisée `ticketsScanned` ≤ `ticketsSold` — règle métier à confirmer (des cas légitimes existent en billetterie, ex. invités hors vente comptés au scan). Si une règle est voulue : bloquante ou avertissement seulement ? | Événements | Audit domaine Événements (Claude, session 2026-07-17) | 2026-07-17 | 🔴 | [`bugs/146_eventformdrawer_ticketsscanned_sans_validation_croisee.md`](bugs/146_eventformdrawer_ticketsscanned_sans_validation_croisee.md) |
| 8 | Store `events.js` : TTL de cache 5 min, contre 15 min pour les 3 stores de taxonomie voisins (convention documentée dans `CLAUDE.md`). Aucun pipeline temps réel ne met à jour les events (saisie manuelle uniquement, vérifié) — pas de justification opérationnelle trouvée pour un TTL plus court. Choix volontaire à documenter, ou aligner sur 15 min ? | Événements | Audit domaine Événements (Claude, session 2026-07-17) | 2026-07-17 | 🔴 | [`bugs/147_events_store_ttl_5min_incoherent.md`](bugs/147_events_store_ttl_5min_incoherent.md) |
| 9 | `EventDrawerShell.vue` existe dans `components/events/drawers/` mais n'est utilisé par aucun des 3 drawers du domaine Événements (ils dupliquent son markup de header/footer) — ses seuls consommateurs réels sont côté Prévision, et son CSS contient un correctif de z-index/stacking spécifique à un besoin de ce domaine (overlay plein écran EventPredict). Migrer les 3 drawers dessus (retrofit du shell pour supporter leur footer variable + `persistent`), ou assumer la duplication comme deux besoins différents ? | Événements / Prévision | Audit domaine Événements (Claude, session 2026-07-17) | 2026-07-17 | 🔴 | [`bugs/148_eventdrawershell_inutilise_duplication_markup.md`](bugs/148_eventdrawershell_inutilise_duplication_markup.md) |

## Questions résolues

| # | Question | Réponse (résumé) | Repliée dans |
|---|---|---|---|
| 1 | Sur `/suppliers`, le formulaire front rend `email`, `phone`, `address`, `city`, `postcode` obligatoires, alors que le modèle Prisma `Supplier` et `CreateSupplierDto` ne rendaient obligatoire que `name`. Faut-il aligner le front sur le backend ou durcir le backend ? | Décidé par l'utilisateur le 2026-07-16 : durcir le backend pour matcher le front. `contactName` inclus dans le même durcissement (également obligatoire côté front, oublié dans la question initiale). Schema Prisma + `CreateSupplierDto` mis à jour (email/tel/address/city/postcode/contactName non-optionnels) ; migration écrite avec backfill des lignes existantes (3 à 6 lignes selon le champ, sur 15 fournisseurs) et **appliquée le 2026-07-16 via `prisma migrate deploy`** (conformément à [ADR-0002 (backend)](../../backend/docs/adr/0002_migrations_manuelles_jamais_plateforme.md), sur autorisation explicite de l'utilisateur) contre la base pointée par `backend/.env` — vérifié en base (`\d "Supplier"` : colonnes `email/tel/address/city/postcode/contactName` en `NOT NULL`). | `backend/prisma/schema.prisma` (model Supplier), `backend/src/features/suppliers/dto/create-supplier.dto.ts`, `backend/prisma/migrations/20260716170000_supplier_required_contact_fields/` |
