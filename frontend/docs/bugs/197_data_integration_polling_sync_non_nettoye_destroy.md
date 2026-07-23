# BUG-197 — La boucle de polling du sync legacy n'est jamais interrompue si le composant est détruit en plein sync

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/views/DataIntegrationView.vue:1022-1025` (`beforeUnmount`), `:1421`
  (`livePollTimer`), `:1440-1448` (intervalle 5s), `:1518` (boucle interne de retry 409)

## Symptôme

`beforeUnmount` ne retire que les listeners `locale-changed`/`theme-changed`. Il ne fait rien pour
un `handleSync` en cours (par ex. bloqué dans la boucle interne de retry 409, qui peut tourner
jusqu'à 10 minutes). Si le composant est vraiment détruit pendant une sync (éviction du cache
keep-alive, déconnexion…), le `setInterval`/la chaîne récursive `await new
Promise(setTimeout...)` continue d'émettre des requêtes réseau et de muter `this.syncSteps` sur une
instance détruite — aucun flag d'abandon n'est vérifié dans la boucle.

## Cause racine

`livePollTimer` n'est nettoyé que dans le `finally` de la méthode elle-même
(`DataIntegrationView.vue:1549`), inatteignable si la boucle externe `while(true)` ne se termine
jamais naturellement parce que le composant a été détruit plutôt que la boucle.

## Correction

Ajout d'un data field `syncAbandoned: false` dans `DataIntegrationView.vue`, mis à `true` dans
`beforeUnmount()`. Une vérification `if (this.syncAbandoned) break` a été ajoutée en tête de la
boucle externe `while(true)` de `handleSync` (retry des POST transactions) et en tête de la boucle
interne `while(true)` du polling 409 (celle qui peut tourner jusqu'à `MAX_409_WAIT_MS`). Les deux
boucles s'arrêtent donc dès l'itération suivante si le composant est détruit en cours de sync, sans
émettre de nouvelle requête réseau.

## Risque de régression / à surveiller

Peu probable en usage normal (la vue est `keepAlive: true`), mais réel en cas de déconnexion ou
d'éviction du cache Vue — à tester en forçant une navigation/déconnexion pendant un sync long.

## Références

- `docs/modules/05_INTEGRATIONS_VENTES.md` (mécanisme A, sync incrémental legacy).
