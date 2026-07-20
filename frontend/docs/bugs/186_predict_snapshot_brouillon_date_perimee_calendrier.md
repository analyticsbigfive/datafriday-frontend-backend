# BUG-186 — EventPredict : la date périmée d'un snapshot/brouillon écrase la date canonique → l'event disparaît du calendrier

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟠 Majeur (event invisible dans le calendrier = prédiction inaccessible ; date Settings silencieusement rétablie)
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : `datafriday-web` (le miroir `EventPredictView.vue` du repo déployé porte le même code aux mêmes lignes)
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/components/EventPredictView.vue:5668` (`omitEventIdentity`), `:5679-5686` (`applyVersion`), `:5481-5488` (`restoreDraftAfterLoad`), `:4603-4628` (`pickEventOverride`), `:1580-1596` (`futureEvents`/`futureDateValues`) ; `src/store/modules/analyse.js:1669` (`APPLY_EVENT_PREDICT_VERSION`)

## Symptôme

Repro réelle (2026-07-18, espace Auxerre) :
`/spaces/cmovsjbiz01lzvwyn30wweqpf?toolbox=event-predict&configuration=cmr8axbc80002sn07gcdh5ley&event=70d4d594-6545-4ce8-ad55-28b48b9e4767` (« Auxerre Ipswich » sélectionné, 2 événements à venir au calendrier).

1. Clic « Auxerre vs Soyaux » → OK en apparence.
2. Re-clic « Auxerre Ipswich » → le badge calendrier d'« Auxerre vs Soyaux » disparaît, la chip retombe à « 1 événement à venir ».

Mécanique du masquage : la mutation destructrice se produit **à la sélection** de l'event (étape 1), mais son jour reste affiché en rouge par le marqueur `selectedDate` (rendu indépendamment d'`allowed-dates`). La perte ne devient visible qu'à la **désélection** (étape 2) — d'où le « ça marche une fois, puis disparition au retour ».

Symptôme généralisé (même classe que le bug historique « ancien nom qui revient » qui a créé `omitEventIdentity`) : toute date modifiée dans Settings/Profile est silencieusement rétablie à l'ancienne valeur à chaque sélection de l'event, tant qu'une version/un brouillon antérieur existe.

## Cause racine

Sélectionner un event déclenche le watcher `selectedEventId` (`:3104-3153`) → `loadVersionsForEvent` (`:5625-5651`) → auto-`applyVersion` de la version active/défaut + `restoreDraftAfterLoad`. Ces deux chemins re-mergent un état FIGÉ sur l'event live :

- `applyVersion` (`:5679-5686`) :
  ```js
  const snap = this.omitEventIdentity(v.eventSnapshot);
  this.events = this.events.map((e) =>
    e.id === this.selectedEventId ? { ...e, ...snap, id: e.id } : e,
  );
  ```
  `eventSnapshot` est une copie **complète** de l'event au moment du save (`snapshotForVersion` `:5538` : `eventSnapshot: { ...this.selectedEvent }`).
- `restoreDraftAfterLoad` (`:5481-5488`) : même merge avec `draft.eventOverride` (localStorage `analyse:event-predict-draft:<eventId>`), construit par `pickEventOverride` dont la whitelist inclut `eventDate`/`eventEndDate` (`:4614-4615` — le docblock du code les classe « cohérence d'affichage », pas intrant de l'algo).

Or `omitEventIdentity` (`:5668-5674`) ne retirait QUE `name`/`eventName` :

```js
const out = { ...obj };
delete out.name;
delete out.eventName;
return out;
```

→ une `eventDate` périmée (déplacée depuis, ou passée) écrase la date canonique. Le calendrier étant dérivé de `futureEvents` (`:1580`, filtre `parseDDMMYYYY(ev.eventDate) >= today`) → `futureDateValues` (`:1592`) → `:allowed-dates="isFutureEventDate"` (`:4448`, pur test d'appartenance, indépendant de la sélection — vérifié), l'event sort de la liste.

Même défaut dupliqué côté store : la mutation `APPLY_EVENT_PREDICT_VERSION` (`analyse.js:1669-1686`), dispatchée par `applyVersion`, mergeait `eventSnapshot` dans `state.events` en ne supprimant que `snap.name`/`snap.eventName`.

Écarté pendant le diagnostic (vérifié, pas supposé) :
- **Pas un bug de format de date** : `parseDDMMYYYY` est un alias de `parseEventDate` (`utils/dateFr.js`), qui accepte DD/MM/YYYY ET ISO. Pur problème de staleness.
- **`performReset` (`:5792`) sain** : `originalEventStates` est capturé synchroniquement dans le watcher (`captureOriginalsForEvent` `:3123`) AVANT le merge débounce (150 ms) — il restaure l'état canonique.
- **Repro conditionnelle** : sans version sauvegardée ni brouillon localStorage, `applyVersion`/`restoreDraftAfterLoad` sont des no-ops et le bug ne se produit pas. L'event qui disparaît porte forcément un snapshot/brouillon dont la date diffère de la canonique.

## Correction

2026-07-18, même règle que le précédent « nom » : **la valeur canonique gagne au restore**.

1. `omitEventIdentity` (`EventPredictView.vue`) strippe désormais aussi `date`/`eventDate`/`eventEndDate` — couvre d'un seul point les deux canaux (snapshot version + brouillon localStorage).
2. Mutation `APPLY_EVENT_PREDICT_VERSION` (`analyse.js`) : mêmes 3 `delete` ajoutés.
3. `pickEventOverride` NON modifié (volontaire) : les dates restent dans la whitelist car elles alimentent le chemin d'édition FRAÎCHE (`applyEventOverrideLocal` au Save → PATCH `/events/:id`, la date éditée devient canonique) et la persistance des events démo/`pred-*`. Elles ne sont ignorées qu'au RESTORE. Docblock annoté.

Pas de migration : les vieux brouillons localStorage contiennent encore `eventDate`, inoffensif (ignoré au restore). Pas de test unitaire ajouté : `omitEventIdentity` est une méthode du monolithe `EventPredictView.vue` (9192 lignes, zéro test existant) ; l'extraire en util juste pour un test sort du périmètre minimal.

## Risque de régression / à surveiller

- `hasVersionChanges` (`:2948-2954`) peut activer « Mettre à jour » juste après chargement d'une version dont la date snapshot diffère de la canonique — comportement déjà accepté pour le rename, auto-guérison en 1 clic (re-snapshot).
- Une version sauvegardée avec une date jamais PATCHée ne restaure plus cette date. Trade-off assumé : depuis le refactor « draft-local », le Save PATCHe la date canoniquement, donc pour les events réels la canonique EST la valeur éditée.
- À retester manuellement : (1) repro ci-dessus — les deux badges persistent sur plusieurs allers-retours ; (2) date changée dans Settings puis sélection dans EventPredict → nouvelle date affichée, badge sur le bon jour ; (3) édition de date via l'éditeur + Save → badge déplacé, persiste au reload ; (4) chargement de version → prédictions/ajustements restaurés à l'identique, seule la date reste canonique.

## Références

- Précédent direct : bug « ancien nom qui revient » (origine d'`omitEventIdentity`).
- Famille intégrité versions EventPredict : fiches 180, 181.
- Miroir : si le repo déployé est `datafriday-web`, appliquer les 2 mêmes edits (`EventPredictView.vue` `omitEventIdentity`, `analyse.js` mutation) — code identique aux mêmes lignes.
