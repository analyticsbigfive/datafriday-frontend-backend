# BUG-112 — Bissection de collecte Weezevent strictement séquentielle : import complet d'un gros tenant dépasse le timeout frontend

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `api-datafriday-staging` (cause racine), `datafriday-web` (symptôme observé, voir fiche miroir front BUG-235)
- **Découvert le** : 2026-07-28 (signalement utilisateur KOUAME Ulrich Kouadio : import complet du tenant Auxerre sur une instance nouvellement créée échoue avec "La synchronisation a dépassé le délai maximal")
- **Fichiers** : `src/features/weezevent/services/weezevent-collect-worker.service.ts:97-158` (`fetchChunk`), `:16-43` (sémaphore ajouté)

## Symptôme

Lancer une synchronisation Weezevent complète (wizard d'intégration, étape 4) pour un tenant
volumineux — Auxerre (18 shops, ~28 791 lignes rien que pour `WeezeventTransactionItem` d'après la
fiche 105) — sur une instance neuve se termine par l'erreur front `intgSyncProgTimeout` ("La
synchronisation a dépassé le délai maximal — cela prend trop de temps, contactez le support"), alors
que le job backend est toujours en cours d'exécution (aucune annulation n'est envoyée par le
frontend à ce timeout, cf. BUG-235).

## Cause racine

L'API Weezevent plafonne toujours ses réponses à 500 items (`total_pages` toujours 1, pagination
inopérante — cf. `docs/old/weezevent/WEEZEVENT_TRANSACTION_FETCH.md`). Le contournement est une
bissection récursive par plage de dates dans `WeezeventCollectWorkerService.fetchChunk()` : quand le
cap est atteint, la plage est coupée en deux et chaque moitié est retraitée récursivement.

Avant ce fix, les deux moitiés étaient **awaitées séquentiellement** :
```ts
await this.fetchChunk(..., fromIso, new Date(midMs - 1).toISOString());
await this.fetchChunk(..., new Date(midMs).toISOString(), toIso);
```
Pour un tenant avec une densité de transactions élevée, l'arbre de bissection produit des
dizaines/centaines de feuilles, chacune un aller-retour HTTP réel (jusqu'à `WEEZEVENT_HTTP_TIMEOUT_MS`
= 15s, avec jusqu'à 3 tentatives en backoff exponentiel côté `WeezeventApiService`). Exécutées une
par une, le temps de collecte total scalait linéairement avec le nombre de feuilles — largement
suffisant pour dépasser les 10 minutes du timeout de polling frontend d'alors (BUG-206), alors que le
worker d'insertion en aval (`WeezeventInsertWorkerService`) traitait déjà ses chunks en parallèle
(`PARALLEL_CHUNKS = 5`).

## Correction

Les deux branches récursives de `fetchChunk` partent maintenant en parallèle (`Promise.all`),
bornées par un sémaphore maison (`acquireSlot`/`releaseSlot`, lignes 16-43) qui limite le nombre
d'appels HTTP Weezevent réellement concurrents à `WEEZEVENT_COLLECT_CONCURRENCY` (env var, défaut
5 — même ordre de grandeur que `PARALLEL_CHUNKS` côté insertion). Sans cette borne, paralléliser
l'arbre de bissection sans limite ferait exploser le nombre de requêtes simultanées pour un gros
tenant et déclencherait le rate-limit (429) ou ouvrirait le circuit breaker partagé de
`WeezeventApiService`.

Combiné au fix front BUG-235 (timeout d'inactivité au lieu de durée totale), un gros tenant peut
désormais collecter plus vite (division du temps de collecte par ~`WEEZEVENT_COLLECT_CONCURRENCY`)
et, tant qu'il progresse réellement, ne se fait plus couper par un seuil de durée fixe déconnecté de
la taille réelle du dataset.

## Risque de régression / à surveiller

- Vérifier en conditions réelles que la collecte complète d'Auxerre (ou tenant de taille comparable)
  se termine sans déclencher le circuit breaker Weezevent (`WeezeventApiService`, seuil 50% d'erreurs
  sur 10 appels) — si ça arrive, réduire `WEEZEVENT_COLLECT_CONCURRENCY` via env var plutôt que de
  revenir au séquentiel.
- Le compteur `activeCount`/`waitQueue` du sémaphore est une propriété d'instance du service
  (`@Injectable()` singleton Nest par défaut) : il est donc **partagé entre tous les jobs de sync en
  cours**, toutes tenants confondus, sur une même instance applicative — voulu (protège l'API
  Weezevent globalement, cohérent avec le circuit breaker déjà partagé), mais à garder en tête si
  plusieurs gros tenants synchronisent en même temps (ils se partageront les 5 slots).
- Aucune migration de données requise — changement de comportement d'exécution uniquement.

## Références

- BUG-104/105/107 (autres bugs de la chaîne de sync Weezevent par job, même fichier/famille).
- BUG-206 (front) — timeout de polling initial (durée totale fixe) qui rendait ce problème visible
  côté utilisateur.
- Fiche miroir front : [`datafriday-web/docs/bugs/235_...`](../../../frontend/docs/bugs/235_syncprogress_stepprocesstimeline_timeout_duree_totale_faux_positif_gros_tenant.md).
- Fiche 51 (`Auxerre` déjà citée comme tenant de référence pour les volumes de données réels).
