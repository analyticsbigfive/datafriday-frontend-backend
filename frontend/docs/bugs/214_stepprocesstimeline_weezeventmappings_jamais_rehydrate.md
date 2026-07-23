# BUG-214 — `weezEventMappings` jamais réhydraté au chargement : "Créer et lier tout" peut créer des Events en double

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes (wizard, étape 4)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepProcessTimeline.vue:1241-1265`
  (`loadWeezeventEvents`), `:788-793` (`mounted()`), `:627-628` (`weezEventMappings: {}`),
  `:1118-1230` (`bulkCreateEvents`)

## Symptôme

`loadWeezeventEvents` est la seule fonction qui restaure les liens persistés (`dfEventId`) via
`getWeezeventEventsForSpace`, mais elle n'a **aucun point d'appel** dans tout le fichier (confirmé
par grep — seule sa propre définition matche). `weezEventMappings` démarre donc toujours à `{}` à
chaque montage/rechargement. `bulkCreateEvents` calcule `toCreate = weezeventEvents.filter(e =>
!weezEventMappings[e.id])` — comme la map est toujours vide au chargement, **tous** les événements
Weezevent semblent non mappés, même ceux déjà liés à un `Event` DataFriday côté serveur.

Repro : l'utilisateur exécute "Créer et lier tout" une fois, puis recharge la page/rouvre l'étape
du wizard (les deux démontent et remontent `StepProcessTimeline` via le `v-else-if="currentStep ===
4"` de `IntegrationWizard.vue`), puis relance l'action de la bannière → `createEvent()` se
redéclenche pour des événements déjà liés, créant des `Event` en double pour le même événement
Weezevent.

## Cause racine

La méthode d'hydratation manifestement écrite dans ce but (`loadWeezeventEvents`) est orpheline —
jamais câblée dans `mounted()` ni dans le watcher `spaceId`, contrairement à `loadTimeline`.

## Correction

Ajouté un appel à `loadWeezeventEvents()` dans `mounted()` (juste après `loadTimeline(...)`) et
dans le watcher `spaceId`, symétriquement à `loadTimeline`. `weezEventMappings` est désormais
réhydraté à chaque montage/rechargement d'espace, donc `bulkCreateEvents` (`toCreate =
weezeventEvents.filter(e => !weezEventMappings[e.id])`) exclut correctement les événements déjà
liés dès le premier calcul.

## Risque de régression / à surveiller

Vérifier s'il existe déjà des `Event` en double créés par ce bug chez des tenants ayant utilisé
"Créer et lier tout" plusieurs fois — nettoyage de données potentiellement nécessaire.

## Références

- `docs/modules/05_INTEGRATIONS_VENTES.md` (étape 4, distinction `Event` DataFriday vs
  `WeezeventEvent`).
