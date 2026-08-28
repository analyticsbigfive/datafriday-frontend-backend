# BUG-144-01 — OOM Render sur la page Analyse : « Instance restarted » sans trace, 20-38 s par requête

- **Statut** : partiellement corrigé (2026-08-25, non testé) — garde-fous livrés : file globale
  frontend (2 max), sémaphore serveur (2/32/60 s→503), scope resolveEventSalesScope caché 60 s,
  cache analyse-unmapped + invalidation mappings ; **étape 5 (25/08 après-midi)** :
  `event-timeline?granularity=summary` — la timeline de montage (le plus gros poste) ne
  transporte plus la dimension minute (~100× plus léger, GROUP BY sans minute côté SQL →
  attaque aussi les 20-38 s). Reste : paniers summary (5.2, différé — grain minute requis
  par TX/MIN/peak/first60) ; recette navigateur à faire.
- **Modules** : spaces (3 endpoints batch Analyse), infra Render
- **Fiches liées** : frontend 364-01 (le versant navigateur du même chantier), 143-01 (cache Redis
  des batchs), 361-01 (concurrence des paquets — la borne actuelle est PAR endpoint), 142-01 /
  145-01 / 146-01 (l'écart de chiffres constaté en même temps, cause distincte)

## En clair

Quand quelqu'un ouvre la page Analyse du Stade Jean Bouin (77 matchs), le serveur meurt
parfois d'un coup, sans laisser de message d'erreur — Render affiche juste « Instance
restarted ». La raison : la page envoie jusqu'à 8 grosses requêtes SQL en même temps à un
serveur qui n'a que 512 Mo de mémoire. Chaque requête fabrique des mégaoctets de JSON ;
à 8 en parallèle, la mémoire explose et le système tue le processus net — c'est pourquoi
il n'y a jamais de trace dans les logs. Le remède : limiter à 2 requêtes lourdes à la fois
(côté navigateur ET côté serveur), et servir des réponses beaucoup plus petites (fiche
364-01 / plan étape 5).

## Symptôme

- Logs Render : `==> Instance restarted` sans stacktrace = SIGKILL cgroup (OOM), plan free
  512 Mo, mesuré le 24/08 pendant un chargement Jean Bouin à froid.
- HAR du 24/08 : requêtes batch à 20,3 s / 21,3 s / 38,3 s ; ~164 Mo de JSON décompressé
  transférés au montage (compression réseau efficace : 1,2 Mo transférés pour 39 Mo, le
  coût est serveur et navigateur, pas réseau).

## Cause racine

1. **Concurrence non bornée globalement** : 4 chargeurs frontend en `watch { immediate: true }`
   × pool de 2 chacun (`_BATCH_CONCURRENCY = 2`, `space.api.js:225` — borne PAR endpoint,
   récidive de BUG-357-01/361-01) = jusqu'à 8 requêtes SQL lourdes simultanées.
2. **Aucune protection côté serveur** : pas de file d'attente, pas de 503 — le serveur accepte
   tout et alloue tout (lignes SQL + objets + `JSON.stringify` simultanés).
3. Pas de plafond mémoire V8 configuré → le GC ne devient agressif qu'après le seuil
   par défaut, trop tard pour 512 Mo : le cgroup tue avant. (Décision JLH 25/08 : pas de
   `NODE_OPTIONS` dans render.yaml pour l'instant — retiré du plan.)
4. Le CRON tourne dans le même process web (`app.module.ts:130`) et partage la même mémoire.

## Correctif (planifié — plan `dynamic-squishing-moon`, 25/08)

- **Étape 2.1 (frontend, fiche 364-01)** : file FIFO GLOBALE module-level dans `space.api.js`,
  concurrence 2 pour tous les batchs de la page (au lieu de 2 × 4 endpoints) ; chunk
  `analyse-unmapped` 30 → 15.
- **Étape 4.1 (backend)** : sémaphore maison `shared/utils/semaphore.ts` (concurrence 2,
  file 32, timeout 60 s → 503) autour de la section SQL des 3 méthodes batch de
  `spaces.service.ts` — les hits cache (143-01) ne font pas la queue.
- **Étape 4.2** : `resolveEventSalesScope` allégé (1er `event.findMany` supprimé — dérivable
  de `allSpaceEvents` — + cache Redis 60 s `spaces:salesscope:{tenantId}:{spaceId}`, purge
  via `invalidateSpaceCache`).
- **Étape 4.3** : cache Redis d'`analyse-unmapped` (même pattern que 143-01) + invalidation
  à l'écriture de mapping — remplace la décision BUG-137-01 (documenté dans la fiche 143-01
  §Décisions, à amender).
- **Étape 5 (le fond)** : réponses de montage sans grain minute (~10-20 Ko/event au lieu de
  ~2 Mo) — c'est ce qui rend l'OOM impossible par construction.

## Recette

1. Jean Bouin à froid : DevTools → jamais plus de 2 requêtes batch en vol, tous endpoints
   confondus.
2. Render pendant le chargement : mémoire stable, plus de « Instance restarted ».
3. Charge simulée (2 onglets simultanés) : les requêtes excédentaires attendent ou reçoivent
   un 503 propre — plus jamais un kill silencieux.

JLH
