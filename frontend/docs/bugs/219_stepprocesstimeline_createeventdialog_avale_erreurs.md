# BUG-219 — `CreateEventDialog` avale les erreurs de création sans aucun retour à l'utilisateur

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 4)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/dialogs/CreateEventDialog.vue:495-524`
  (`submitCreateEvent`)

## Symptôme

Si `createEvent(...)` échoue (erreur de validation, réseau, permission), le bloc catch se contente
d'un `console.error(...)` ; aucun état d'erreur, aucune `v-alert`, aucun snackbar. Le spinner
s'arrête simplement et le dialog reste affiché avec le formulaire rempli — l'utilisateur n'a aucune
indication qu'un problème est survenu et aucune raison de changer d'approche pour réessayer.

## Cause racine

Contrairement à ses propres sous-dialogs de création de type/catégorie/sous-catégorie
d'événement (qui ont chacun un ref `*CreateError` dédié affiché via `v-alert`), le chemin de
soumission principal n'a aucune surface d'erreur équivalente.

## Correction

Rien à ce jour. Ajouter un état d'erreur et une bannière visible, symétriquement aux sous-dialogs
déjà présents dans le même fichier.

## Risque de régression / à surveiller

—

## Références

- `docs/modules/05_INTEGRATIONS_VENTES.md` (étape 4, dialogs).
