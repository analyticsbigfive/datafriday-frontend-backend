# BUG-369-02 — Aucun repère fiable club/intégration dans la liste "Couvertes" du step 4, mapping manuel non filtré par intégration

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (ergonomie / garde-fou, pas de corruption de données)
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-08-25 — KOUAME Ulrich, en testant le wizard PFC sur un space
  (Jean Bouin) partagé avec une 2ᵉ intégration (SFP) : "je peux faire le mapping de SFP ici même
  si je suis sur PFC ? ça va marcher ?"
- **Fichiers** :
  - `backend/src/features/events/events.service.ts` (`includeRelations`)
  - `frontend/src/components/integration/wizard/StepProcessTimeline.vue`

## Contexte

La liste "Couvertes" du step 4 affiche volontairement TOUS les events d'un space, toutes
intégrations confondues (PFC + SFP sur Jean Bouin) — utile pour avoir une vue d'ensemble. Mais
rien ne permettait de distinguer visuellement à quel club/intégration appartient chaque ligne, à
part le nom saisi manuellement par l'utilisateur ("PFC-Marseille", "SFP-Bordeaux") — une
convention, pas un contrôle du système. Un event mal nommé serait passé inaperçu.

Deuxième trou lié : le dialog "Mapper à un événement existant" (`MapEventToExistingDialog`,
ouvert depuis une date non couverte) proposait cette même liste complète sans filtre — depuis le
wizard PFC, rien n'empêchait de sélectionner par erreur un event SFP.

## Fix

- **Badge fiable** : `Event.integration` (id + name) inclus dans `includeRelations`
  (`events.service.ts`), affiché en badge à côté du nom de l'event dans la liste "Couvertes"
  — basé sur `Event.integrationId` (le vrai champ), pas sur le nom.
- **Filtre du dialog de mapping** : computed `mappableEvents`, même règle que le relink
  automatique de `bulkCreateEvents` (`!integrationId || integrationId === location.id`) —
  seuls les events sans intégration ou déjà de l'intégration courante sont proposés.
- **Reclassement manuel** : le badge est cliquable (menu Vuetify listant les intégrations
  connues du space, dérivées des events déjà chargés) → `updateEvent(id, {integrationId})`,
  pour corriger un event mal classé sans repasser par Démapper + Créer et lier tout.

## Risque de régression / à surveiller

- `spaceIntegrations` (liste proposée dans le menu) est dérivée des events déjà chargés dans le
  wizard, pas d'un endpoint dédié "intégrations du space" (aucun n'existe) — une intégration du
  space qui n'a encore AUCUN event taggué n'apparaîtrait pas dans le menu tant qu'aucun badge ne
  la révèle.
- Le badge nécessite un redémarrage backend (nouveau champ `include`) pour apparaître.

## Références

- [BUG-368-02](368_02_event_integrationid_mode_robuste_remplace_conteneur_saison.md) — le champ
  `Event.integrationId` que ce badge rend enfin visible.
- [BUG-370-02](370_02_job_integrationid_incompatible_avec_integration_range.md) — trouvé en
  creusant les données révélées par ce badge (deux events du même space, mêmes chiffres).
