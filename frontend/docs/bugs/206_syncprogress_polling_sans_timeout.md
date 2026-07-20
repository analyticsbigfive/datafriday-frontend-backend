# BUG-206 — Le polling d'un job de sync (dialog et widget) n'a aucun timeout/abandon

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/SyncProgressDialog.vue:443-472`,
  `src/components/SyncJobFloatingWidget.vue:154-181`

## Symptôme

Ni `_startJobPoll` (dialog) ni `_startPoll` (widget) n'ont de logique de durée maximale/backoff/
abandon : les deux interrogent indéfiniment toutes les 3s/5s jusqu'à ce que le backend rapporte
`COMPLETED`/`FAILED`. Si un job reste bloqué (worker orphelin, insert-worker planté…), les deux
surfaces UI tournent indéfiniment sans jamais afficher d'erreur à l'utilisateur. Les erreurs de
polling elles-mêmes sont aussi avalées silencieusement (`catch (e) { console.error/warn(...) }`,
dialog ligne 464-466, widget ligne 175-177) — sans backoff ni plafond de tentatives, un polling qui
échoue en permanence est indiscernable côté UI d'un job légitimement lent.

## Cause racine

Non déterminé si c'est volontaire (le backend garantit-il toujours un état terminal ?) — aucun
filet de sécurité côté client dans les deux cas.

## Correction

Rien à ce jour. Ajouter un timeout explicite (ex. aligné sur le `MAX_WAIT_MS` de 10 minutes déjà
utilisé ailleurs dans le domaine, `StepProcessTimeline.vue:977-978`) avec message d'erreur clair, et
un plafond de tentatives consécutives en échec avant d'afficher un état d'erreur.

## Risque de régression / à surveiller

Coordonner avec BUG-218 (StepProcessTimeline a le même problème sur sa propre boucle de poll,
différente de celle-ci) — envisager une factorisation commune (composable `useJobPolling`) plutôt
que des correctifs séparés dans chaque copie.

## Références

- BUG-218 (même classe de problème, autre composant).
