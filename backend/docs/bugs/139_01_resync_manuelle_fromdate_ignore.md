# BUG-139-01 — Aucun chemin de resync ne peut rattraper une fenêtre passée : le bouton n'envoie pas de bornes, et le curl voit son `fromDate` ignoré

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix à faire)
- **Sévérité** : 🔴 Bloquant/impact business (le seul outil de rattrapage de BUG-138-01 est inopérant, et le dialogue affiche un succès)
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging` + `datafriday-web`
- **Découvert le** : 2026-08-24
- **Fichiers** : `src/features/weezevent/services/weezevent-incremental-sync.service.ts:251,260-263`, `src/features/weezevent/weezevent.controller.ts:175-176,183-196,202-203`, `frontend/src/views/DataIntegrationView.vue:1679`, `frontend/src/api/endpoints/aggregation.api.js:250-252`

## Symptôme

Après une re-synchronisation lancée sur Le Mans FC le 24/08, **les 81 transactions de
BUG-138-01 manquent toujours**. Écart mesuré en base le 24/08 à 18:36 UTC, intégration
« Le Mans FC Weez » (`cmt01vzza007dqw011q4js95x`), événement Le Mans-Brest du 22/08 :

| Source | Transactions | Montant |
|---|---|---|
| Export Weezevent (`frontend/exports/Ligue 1 Brest - Bert Données.csv`) | 5 802 | 76 322,00 € TTC / 66 458,93 € HT |
| Base — intégration `cmt01vzza…` (celle de l'espace) | **5 721** | 75 285,00 € TTC |
| Base — intégration témoin `cmt7k46lk…` (créée le 24/08 18:15, sync par **job chunké**) | **5 802** | 76 322,00 € TTC |
| `SpaceRevenueMinuteAgg` — espace `cms81300i…`, 22/08 | **5 721** | 65 561,02 € HT |

Blocs manquants inchangés (bornes `transactionDate`, UTC), obtenus par différence entre les
deux intégrations :

| Bloc | Transactions | TTC | Fenêtre |
|---|---|---|---|
| 7148 → 7162 | 15 | 183,50 € | 19:44:49,605 → 19:45:08,041 |
| 7663 → 7728 | 66 | 853,50 € | 19:54:06,214 → 19:55:10,216 |
| **Total** | **81** | **1 037,00 €** (897,91 € HT) | |

L'intégration témoin prouve que la donnée est disponible côté Weezevent : le job chunké
(`WeezeventSyncJob` `cmt7k4i4o00gtm36lqlj77z7t`, 23 chunks, fenêtre 20→23/08) a importé
**5 802 / 5 802** en 27 s. Ce n'est ni un problème de source, ni de droits.

**Ce que la base ne dit pas.** `WeezeventSyncState` ne garde qu'une ligne par
(intégration, type) : le cron 10 minutes l'écrase à chaque passe. Un relevé à 18:50 montre
**19 intégrations** synchronisées séquentiellement en ~300 ms chacune, toutes à
`lastSyncCount = 0` — dont `cmt01vzza…` à 18:50:08. Toute trace d'une resync manuelle
antérieure a donc été effacée. Le diagnostic ci-dessous ne repose pas sur cette trace mais
sur le code : **aucun des deux chemins de resync ne peut, par construction, rattraper une
fenêtre passée.**

## Cause racine

### Chemin 1 — le bouton « Re-synchroniser » (front) n'envoie aucune borne

`DataIntegrationView.vue:1679` :

```js
res = await syncWeezeventData('transactions', { integrationId: integration.id })
```

Le wrapper poste `{ type, ...options }` (`aggregation.api.js:252`) : le corps ne contient
**ni `fromDate`, ni `toDate`, ni `full`**. Le backend part donc en incrémental pur, fenêtre
= `lastSyncedAt − 5 min` ≈ maintenant. **Le bouton ne regarde que vers l'avant** : il ne
peut structurellement pas réimporter le 22/08, quel que soit le nombre de clics.

Aggravant : le dialogue affiche `count: res.count`, qui est le **total en base** pour
l'intégration (6 721), pas ce qui vient d'être importé — `itemsCreated` (0) n'est montré que
comme `newCount`. Un rattrapage à zéro transaction s'affiche donc comme un gros chiffre
rassurant.

### Chemin 2 — le curl du runbook : `fromDate` silencieusement écrasé

`weezevent-incremental-sync.service.ts:260-263` :

```ts
const fromDate = useIncremental && syncState.lastSyncedAt
    ? new Date(syncState.lastSyncedAt.getTime() - 5 * 60 * 1000) // 5 min overlap
    : options.updatedSince ?? null;
const toDate = options.updatedUntil ?? undefined;
```

`useIncremental = !options.forceFullSync && !isFirstSync` (`:251`). Sur une intégration déjà
synchronisée et sans `full: true`, il vaut `true` → **la branche `options.updatedSince` n'est
jamais atteinte**. Le `fromDate` explicitement demandé est écrasé par le curseur d'état.

`options.updatedUntil` est honoré sans condition (`:263`). Les deux bornes ne sont donc pas
traitées symétriquement, et la requête envoyée à Weezevent
(`weezevent-client.service.ts:54-60`) devient **auto-contradictoire** : `created_at__gte`
vaut une date du jour (curseur − 5 min, donc toujours postérieure au match), tandis que
`created_at__lte` vaut la borne demandée du 22/08. `gte > lte` → ensemble vide **par
construction**, quelle que soit la donnée disponible.

Le contrôleur n'est pas en cause : il transmet correctement les deux bornes
(`weezevent.controller.ts:175-176` puis `:202-203`). Son unique porte de sortie,
`autoFullForType` (`:183-196`), ne force `forceFullSync` que si la table est **vide** pour
l'intégration — ici 6 721 lignes, donc jamais déclenchée.

Conséquence : la borne `fromDate` de `SyncWeezeventDto`, documentée dans Swagger comme
« Date de début pour les transactions », est un paramètre mort dans le cas d'usage normal.

## Correction

À faire :

1. **Respecter une fenêtre explicitement demandée.** Si `options.updatedSince` est fourni,
   il gagne sur le curseur d'état — un appelant qui donne une borne sait ce qu'il veut :

   ```ts
   const fromDate = options.updatedSince
       ?? (useIncremental && syncState.lastSyncedAt
           ? new Date(syncState.lastSyncedAt.getTime() - 5 * 60 * 1000)
           : null);
   ```

   Le filtre `existingIds` (`:296`) reste actif, donc rejouer une fenêtre déjà importée
   reste idempotent et bon marché.
2. **Refuser une fenêtre inversée** plutôt que de la laisser partir : `400` si
   `fromDate > toDate`. C'est le garde-fou qui aurait transformé ce silence en erreur
   immédiate.
3. **Ne pas répondre `completed` sur un rattrapage vide.** Remonter la fenêtre réellement
   appliquée (`appliedFrom` / `appliedTo`) : l'opérateur doit voir que la borne demandée
   n'est pas celle qui a été utilisée.
4. **Côté front** : le dialogue de sync doit mettre en avant `itemsCreated`, pas le total en
   base — et un rattrapage daté doit passer par le **job chunké** (`POST /weezevent/sync/start`,
   déjà exposé et déjà utilisé par le wizard), qui est le seul chemin qui a réellement
   importé 5 802/5 802 sur l'intégration témoin.
5. **Aligner `full: true` et fenêtre.** Aujourd'hui `full: true` est le seul moyen d'honorer
   `fromDate`, mais il désactive aussi le filtre `existingIds` et déclenche un
   `refreshForIntegrationSafe` complet (`:358-360`) — deux effets sans rapport avec « je veux
   rejouer cette fenêtre ». Séparer les deux intentions.

**Contournement immédiat, sans changement de code** — appeler l'API en curl avec
`"full": true` **et** des fenêtres étroites. Idempotent : `processBatchTransactions:788`
(`if (existingIds.has(weezeventId)) continue`) et `createMany({ skipDuplicates: true })`
(`:837`) protègent le rejeu. Voir RUNBOOK §2 mis à jour.

## Risque de régression / à surveiller

- **Fenêtres < 500 transactions obligatoires** tant que BUG-138-01 n'est pas corrigé : la
  resync manuelle passe par le même code paginé. Mesuré sur l'intégration témoin complète —
  19:44→19:46 = 110 tx ✅, 19:54→19:56 = 104 tx ✅, mais la fenêtre 19:35→19:56 initialement
  écrite au runbook = **1 114 tx** ❌, plafonnée à 500.
- Le filtre API porte sur `created`, qui vaut **exactement** `transactionDate` en base
  (vérifié : `weezeventId` 6908 → `created` `2026-08-22T19:40:00.246427Z`, `transactionDate`
  `2026-08-22 19:40:00.246`). Les champs `validated` / `started_at` sont antérieurs de
  quelques secondes à quelques dizaines de secondes — **ne pas** élargir la fenêtre en
  croyant compenser des ventes hors-ligne : c'est `created` qui est filtré.
- `WeezeventSyncState` est écrasé par le cron toutes les 10 minutes : il ne peut pas servir
  de journal d'audit d'une resync. Si on veut une trace, passer par `WeezeventSyncJob`
  (une ligne par exécution, conservée) — argument supplémentaire pour le point 4.
- Après le fix, re-tester une resync **sans** `full: true` et vérifier que la fenêtre
  demandée est bien celle appliquée (log `Manual sync started` + réponse).
- Aucun test ne couvre le passage `updatedSince` → paramètre API : à ajouter dans
  `weezevent-incremental-sync.service.spec.ts`.

## Références

- [BUG-138-01](138_01_sync_page_unique_500_curseur_horloge.md) — pourquoi les 81 transactions
  manquent. Le présent bug est la raison pour laquelle le **rattrapage** ne marche pas :
  deux défauts distincts, sur le même chemin de code.
- `docs/RUNBOOK_2026-08-24_ANALYSE_TRANSACTIONS.md` §2 — commandes corrigées.
- [BUG-135-01](135_01_transactions_count_compte_des_lignes.md) — l'écart de comptage
  (5 721 en agrégat), à ne pas confondre avec l'écart d'import (81 transactions absentes).

---

*JLH*
