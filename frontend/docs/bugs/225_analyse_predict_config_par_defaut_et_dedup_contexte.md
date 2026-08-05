# BUG-225 — Analyse / Prédire : aucune configuration pré-sélectionnée (union « All » coûteuse) + contexte PdV dispatché deux fois

- **Statut** : 🟡 **Point 1 (pré-sélection) ANNULÉ le 2026-07-30** — point 2 (dédup contexte PdV)
  toujours en place et valide. Voir « Annulation » en fin de fiche.
- **Sévérité** : 🟠 Majeur (perf : le landing par défaut déclenche le fan-out le plus large du
  module — union de TOUTES les configurations — alors qu'une seule est regardée)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (demande utilisateur : « sélectionne par défaut la première
  configuration sur analyse, prédire »)
- **Fichiers** : `src/store/modules/analyse.js` (`useSpaceDataFetch`, `loadConfigShopContext`,
  `pickDefaultConfiguration`), `src/components/analyse/AnalyseView.vue:893-912` (watcher)

## Symptôme

1. À l'ouverture de `/spaces/:spaceId` (Analyse **et** Prédire), le sélecteur de configuration
   affiche « Toutes les configurations ». Aucun scope n'est posé, et surtout : le chemin union
   `loadAllConfigsShopContext` — `N configs × (getConfiguration + assignation + batch
   shop-menu-items)`, pool de 3 — se déclenche systématiquement, différé mais complet.
2. Le donut « Par zone » reste vide pendant tout ce différé (cf.
   [BUG-223](223_analyse_donut_zone_vide_pendant_contexte_differe.md)) : `shopArea` vient des
   `FloorElements` de ce contexte.

## Cause racine

`resolveConfigSelectionAfterLoad` (`analyse.js:355`) retourne `null` quand rien n'était
sélectionné — comportement voulu à l'origine (reset d'un id périmé), jamais complété par une
règle de **pré-sélection**. `null` = « All Configurations », donc le cas le plus coûteux est le
défaut.

## Correction

Appliquée le 2026-07-20 sur `feat/postEventInventory`.

### 1. Pré-sélection : 1re configuration AYANT des events

> ⚠️ **Ce point 1 n'est plus en vigueur** (annulé le 2026-07-30, cf. § Annulation en fin de fiche).
> Ce qui suit décrit l'état du code entre le 2026-07-20 et le 2026-07-30.

Fonction pure exportée `pickDefaultConfiguration(configurations, events)` : première config dont
les events sont **réellement présents** dans le space chargé — intersection avec `config.eventIds`
**ou** `event.configurationId`, exactement la double règle de `eventsInActiveConfiguration`
(`analyse.js:600`). Repli `null` (« All Configurations ») si aucune config n'a d'event.

Règle **tranchée avec l'utilisateur** le 2026-07-20 (3 options proposées : 1re config avec events
/ avec events *passés* / 1re config sans condition). La condition « avec events » est ce qui
évite d'ouvrir l'écran sur l'alerte « Aucun event rattaché à cette configuration » — une config
sélectionnée **scope strictement** les events.

Nuance connue et acceptée : en mode Analyse seuls les events **passés** sont analysables
(`analysableEvents`). Une config n'ayant que des events futurs peut donc être pré-sélectionnée et
donner un écran Analyse vide (mais peuplé en Prédire). Option « events passés » écartée pour ne
pas faire diverger la règle entre les deux modes.

Appliquée **une seule fois par espace**, gardée par le nouveau state `configAutoSelectedSpaceId` :
`loadSpace` est re-dispatché par d'autres écrans (`EventPredictView.loadAll`…) et rejouerait
sinon la pré-sélection à chaque fois, écrasant un « Toutes les configurations » choisi ensuite
par l'utilisateur — exactement le bug « retombe sur All » que
`resolveConfigSelectionAfterLoad` avait corrigé.

6 tests unitaires ajoutés (`tests/unit/analyseStore.spec.js`) : rattachement par `eventIds`, par
`configurationId`, `eventIds` pointant des events absents, ordre de liste, repli `null`, listes
vides / sentinelle `cfg-all`.

### 2. Dédup du contexte PdV (régression introduite par le point 1)

Avec une pré-sélection, `selectedConfigurationId` **change** (null → cfg-1) au chargement :
le dispatch explicite de `useSpaceDataFetch` **et** le watcher d'`AnalyseView.vue:893-912` partent
tous les deux. Or `buildConfigShopEntry` n'a **aucun cache de résultat** — chaque appel refait
`getConfigShopMenuItemsLight` + `getConfiguration` + l'assignation. Doublon réseau réel.

Garde in-flight ajoutée en tête de `loadConfigShopContext`, **avant** le `BUMP_CONFIG_CTX_REQ`
(sinon on annulerait la requête qu'on veut réutiliser) :

```js
if (configId && configId !== 'cfg-all'
    && state.configContextLoading && state.configContextLoadingId === configId) {
  return
}
```

Nouveau state `configContextLoadingId`, posé avec `SET_CONFIG_CONTEXT_LOADING(true)` et remis à
`null` dans le `finally` (sous `!stale()`).

**Volontairement PAS de dédup « déjà chargé »** (`ctx.configId === configId && floorElements.length`)
: `configShopContext` n'est jamais purgé — `loadSpace` ne reset que `resetBuilder2SubtypesCache()`
malgré son commentaire. Un short-circuit sur l'existant servirait des PdV/zones périmés au retour
du Builder. Seul le vol en cours est dédupliqué.

## Effet de bord bénéfique

Le chemin `loadAllConfigsShopContext` (fan-out le plus large du module) ne part plus qu'à la
demande explicite de « Toutes les configurations ». Le contexte PdV d'une config unique
(2-3 requêtes) part en revanche **immédiatement** dans `useSpaceDataFetch` → le donut « Par zone »
se peuple sans attendre le repli différé de 3 s.

## Risque de régression / à surveiller

- **Changement de comportement visible** : l'écran s'ouvre désormais scopé sur une config. Les
  liens partagés sans `?config=` ne donnent plus la vue « toutes configs ». `null` reste
  sélectionnable dans le select (`anFilterAllConfigurations`).
- Deep-link `?config=<id>` : appliqué **après** `loadSpace` par `ensureAuthAndLoad` — inchangé,
  il écrase la pré-sélection.
- Espaces dont aucune config n'a d'event : comportement strictement identique à avant (`null`).
- `configAutoSelectedSpaceId` n'est jamais remis à `null` : revenir sur un espace déjà visité
  dans la même session ne rejoue pas la pré-sélection (la sélection courante fait foi). Voulu.
- **Non reproduit en navigateur** (pas de `pnpm dev` dans cette session) — à valider manuellement
  sur Analyse **et** `?toolbox=predict`, plus le retour depuis le Builder (fraîcheur des zones).

## Annulation du point 1 — 2026-07-30

Décision de l'utilisateur, sur constat en navigateur : « les widgets de la barre du haut affichent
une première valeur qui semble prendre en compte toutes les configurations, puis se cale sur la
configuration sélectionnée par défaut (**il ne devrait pas y avoir de config par défaut
sélectionnée**) ». La règle « 1re config avec events », tranchée le 2026-07-20, est donc **retirée**.

Ce qui a été supprimé de `src/store/modules/analyse.js` :

- la fonction pure `pickDefaultConfiguration` (et ses 6 tests dans
  `tests/unit/analyseStore.spec.js`) ;
- le bloc de pré-sélection dans `useSpaceDataFetch` ;
- le garde-fou associé : state `configAutoSelectedSpaceId` + mutation
  `SET_CONFIG_AUTO_SELECTED_SPACE_ID`, devenus morts.

`resolveConfigSelectionAfterLoad` **reste** : c'est elle qui purge un id de config hérité d'un autre
espace. Le point 2 (dédup in-flight de `loadConfigShopContext`) reste lui aussi en place — il n'était
pas seulement une conséquence de la pré-sélection : `loadSpace` dispatche toujours le contexte d'une
config préservée, en parallèle du watcher d'`AnalyseView`.

Conséquence perf réassumée : le chemin d'atterrissage redevient l'union « All Configurations », le
fan-out le plus large du module. Elle reste **différée après le premier rendu** (watchers
`enriching` / repli idle 3 s, `AnalyseView.vue`) — c'est cette partie de la correction du 2026-07-20
qui rend l'annulation tenable côté perf.

## Références

- [BUG-223](223_analyse_donut_zone_vide_pendant_contexte_differe.md) — donut « Par zone » et
  contexte différé (même chaîne de causes).
- Plan de chargement par étapes / dé-duplication `market-prices` + `shop-items` : proposé le
  2026-07-20, **non implémenté** (hors périmètre de cette fiche).

---

Rédaction : **JLH**, 2026-07-20.
