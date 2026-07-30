# BUG-250-02 — `EventFormDrawer.vue submit()` : `sessions` double-stringifié → heures illisibles après un premier save

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28, signalé par l'utilisateur ("les heures ne sont pas importées
  quand on importe le fichier CSV"). Confirmé par lecture directe en base (Prisma, lecture seule)
  sur les events réellement importés (`AJA-Nice`, `AJA-Angers`, `AJA-Nantes`) : colonne `sessions`
  = `"[\"{\\\"doorsOpening\\\":\\\"19:00\\\",\\\"showTime\\\":\\\"21:00\\\"}\"]"` — un tableau
  contenant **une chaîne** (elle-même du JSON), pas un tableau d'objets.
- **Fichiers** : `src/components/events/drawers/EventFormDrawer.vue:926` (`submit()`)

## Symptôme

Après import CSV, les heures (Doors Open/Show Time par séance) saisies dans le fichier
n'apparaissent plus dans l'onglet "Séances" du formulaire d'édition d'un event.

## Cause racine

`CsvImportDrawer.vue` envoie bien `sessions` comme un tableau d'objets
(`[{doorsOpening:"19:00", showTime:"21:00"}]`, cf. `parseSessions()`), et le backend fait
`sessions: dto.sessions ? JSON.stringify(dto.sessions) : null` (une seule passe, correcte) — la
donnée est donc écrite proprement à la création.

Mais **`EventFormDrawer.vue submit()`** (le formulaire d'édition manuel, utilisé dès qu'on ouvre un
event pour le modifier — même sans rien changer avant de cliquer "Enregistrer") faisait :

```js
sessions: this.newEvent.sessions.map((s) => JSON.stringify(s)),
```

— stringifiant **chaque élément individuellement** avant envoi. Le backend applique ensuite SA
PROPRE `JSON.stringify(dto.sessions)` sur ce tableau de chaînes déjà stringifiées, produisant un
double niveau d'encodage : `'["{\"doorsOpening\":\"19:00\",\"showTime\":\"21:00\"}"]'`. À la
relecture, `initFormFromEvent()` fait `JSON.parse(e.sessions)`, ce qui ne dé-sérialise qu'**un**
niveau : le résultat est un tableau contenant une **chaîne de caractères**, pas un objet — donc
`session.doorsOpening` vaut `undefined` pour toute l'UI, et les heures semblent avoir disparu.

Tout event ouvert en édition puis sauvegardé au moins une fois (même sans modification) via ce
formulaire perd ainsi ses heures de séance — indépendamment de la façon dont l'event a été créé au
départ (CSV, formulaire manuel, wizard d'intégration).

## Correction

`sessions: this.newEvent.sessions` — envoyé tel quel (tableau d'objets), en laissant le backend
faire l'unique `JSON.stringify`, exactement comme le fait déjà `CsvImportDrawer.vue`.

## Risque de régression / à surveiller

- Ce fix empêche toute **nouvelle** corruption, mais ne répare pas rétroactivement les events déjà
  corrompus en base (ceux sauvegardés au moins une fois via ce formulaire avant ce correctif) — ils
  ont toujours un `sessions` doublement stringifié tant qu'ils ne sont pas réimportés ou resauvegardés
  après correction manuelle des heures.
- `@vue/compiler-sfc` + `@babel/core` propres, suite `pnpm test:unit` ciblée (94 tests) verte.
- Non exécuté en navigateur — à confirmer : créer/importer un event avec des heures, l'ouvrir en
  édition, cliquer "Enregistrer" sans rien changer, rouvrir : les heures doivent rester affichées
  (avant ce fix, elles disparaissaient dès ce premier save).

## Références

- Aucune.
