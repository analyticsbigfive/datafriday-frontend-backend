# BUG-202 — Échec de création de configuration silencieusement avalé (StepMapSpace)

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 1)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepMapSpace.vue:653-690`
  (`handleConfirmConfig`)

## Symptôme

Repro : l'utilisateur crée un nouveau space (`handleCreateSpace` réussit), le dialog post-création
s'ouvre, il remplit le formulaire d'étage et clique "Créer la configuration". Si
`createConfiguration()` (ligne 662) échoue (erreur réseau, 400 de validation…), le `catch` (lignes
684-686) se contente d'un `console.error` — `this.error` n'est jamais renseigné. Le `finally`
(687-689) exécute inconditionnellement `this.creatingConfig = false;
this.closePostCreate()`, qui ferme le dialog exactement comme en cas de succès. L'utilisateur n'a
aucune indication que la configuration n'a jamais été créée ; le space créé se retrouve
silencieusement sans étage/configuration.

## Cause racine

`catch (err) { console.error(...) }` ne propage rien vers `this.error` ni aucune bannière visible,
et `closePostCreate()` est appelé depuis `finally` indépendamment du résultat — la fermeture du
dialog est lue comme un signal de succès dans les deux cas.

## Correction

Dans `handleConfirmConfig` :
- Ajout d'un nouvel état `configError` (data), réinitialisé à `null` en début d'appel.
- `closePostCreate()` n'est plus appelé depuis le `finally` — il est désormais appelé
  explicitement en fin de bloc `try`, uniquement après le succès de `createConfiguration()`.
- Le `catch` renseigne `this.configError = err.message` (en plus du `console.error` existant),
  et le dialog reste ouvert (`persistent`) pour que l'utilisateur voie l'erreur.
- Le `finally` ne fait plus que `this.creatingConfig = false`.
- Ajout d'un bloc d'erreur (`v-if="configError"`) dans le `<v-card-text>` du dialog
  post-création (au lieu de réutiliser la bannière `error` de la page, masquée derrière le
  dialog persistant à ce moment-là).
- `closePostCreate()` réinitialise aussi `configError = null` pour ne pas la faire fuiter vers
  la prochaine ouverture du dialog.

L'utilisateur peut donc retenter (`handleConfirmConfig`) ou annuler (`skipPostCreate`)
manuellement après un échec, au lieu que le dialog se ferme silencieusement.

## Risque de régression / à surveiller

Vérifier également la gestion de la réponse de `POST /spaces` (`space.id ?? space.data?.id`,
ligne 622) — si aucune des deux formes ne matche, `selectedSpaceId` devient `undefined` et alimente
silencieusement `createConfiguration({ spaceId: undefined, ... })`, aggravant ce bug. Non confirmé
sans lecture du contrôleur backend correspondant.

## Références

- `docs/modules/05_INTEGRATIONS_VENTES.md` (étape 1 du wizard).
