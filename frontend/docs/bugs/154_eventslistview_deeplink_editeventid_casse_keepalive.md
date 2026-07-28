# BUG-154 — `EventsListView.vue` : deep-link `?editEventId=` cassé par `keep-alive` après la première visite

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (silencieux — l'URL change, rien ne s'ouvre)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/components/events/views/EventsListView.vue:227-238,419-436`

## Symptôme

`/events?editEventId=<id>` (utilisé par l'alerte "évènements sans coup d'envoi" de la timeline
prédictive, et désormais par `TaxonomyDetailDrawer.vue`, cf. BUG-153) n'ouvre la fiche event que la
**toute première** fois que `/events` est visité dans la session. Toute navigation ultérieure vers
cette URL (l'utilisateur a déjà visité `/events` une fois avant) ne fait rien : l'URL change bien,
la query param reste affichée, mais aucune fiche ne s'ouvre.

## Cause racine

`/events` a `meta: { keepAlive: true }` (`router/index.js:194`) et `DashboardView.vue` enveloppe le
`router-view` dans `<keep-alive v-if="route.meta.keepAlive">`. `openDeepLinkedEvent()` — qui lit
`$route.query.editEventId` et ouvre la fiche correspondante — n'était appelée que depuis `mounted()`
(:419-428). Avec `keep-alive`, `mounted()` ne se déclenche qu'à la création initiale du composant ;
toute réactivation ultérieure (retour sur `/events` depuis une autre page) ne déclenche que
`activated()`, absent ici. Même classe de bug que
[BUG-122](122_spacemenus_deeplink_casse_keepalive.md) (SpaceMenuView, deep-link `?space=&config=`
cassé par le même mécanisme), jamais répliquée sur ce fichier lors de l'audit du domaine Événements
(BUG-130-151) faute de consommateur du deep-link à l'époque autre que l'alerte timeline (rarement
testée en navigation répétée).

## Correction

Ajout d'un hook `activated()` qui rappelle `openDeepLinkedEvent()`. Effet de bord à traiter : sur la
toute première activation d'une session, Vue déclenche `mounted()` puis `activated()` en séquence
sans attendre la résolution de la partie asynchrone de `mounted()` (`await loadEvents()`) —
`activated()` pouvait donc s'exécuter avant que `this.events` ne soit peuplé, échouer à trouver
l'event, puis nettoyer la query (`router.replace`) prématurément, perdant le deep-link de façon
définitive avant même que `mounted()` n'ait fini de charger les events. `openDeepLinkedEvent()`
modifiée pour ne nettoyer la query **qu'après avoir effectivement trouvé et ouvert l'event** — un id
valide fini par être résolu par le prochain appel (celui de `mounted()` une fois `loadEvents()`
résolu) au lieu d'être perdu silencieusement.

## Risque de régression / à surveiller

Un `editEventId` invalide/obsolète (event supprimé entre-temps) ne nettoie plus jamais la query —
avant, elle était effacée même en cas d'échec. Effet résiduel purement cosmétique (l'URL garde le
paramètre), aucune fiche ne s'ouvrant jamais pour un id inexistant de toute façon. Non reproduit en
navigateur (pas de `pnpm dev` dans cette session) — à valider manuellement : visiter `/events` une
première fois, naviguer ailleurs, puis déclencher le deep-link une seconde fois (ex. depuis
`TaxonomyDetailDrawer.vue`) et vérifier que la fiche s'ouvre bien.

## Références

- [BUG-122](122_spacemenus_deeplink_casse_keepalive.md) — même mécanisme (deep-link cassé par `keep-alive`), autre écran.
- [BUG-153](153_taxonomie_view_popup_non_conforme_liste_evenements_absente.md) — nouveau consommateur du deep-link ayant révélé ce bug.
