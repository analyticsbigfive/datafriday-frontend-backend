# BUG-235 — Timeout de polling par durée totale (BUG-206/218) : faux positif "délai maximal dépassé" sur un gros tenant toujours en progrès

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web` (symptôme + fix), `api-datafriday-staging` (cause racine
  contributive — bissection de collecte séquentielle, voir fiche miroir back BUG-112)
- **Découvert le** : 2026-07-28 (signalement utilisateur KOUAME Ulrich Kouadio : import complet du
  tenant Auxerre sur une instance nouvellement créée échoue avec "La synchronisation a dépassé le
  délai maximal — cela prend trop de temps, contactez le support")
- **Fichiers** :
  - `src/components/SyncJobFloatingWidget.vue:164-206` (`_startPoll`)
  - `src/components/integration/SyncProgressDialog.vue:421-459` (`_startJobPoll`)
  - `src/components/integration/wizard/StepProcessTimeline.vue:559`, `:1001-1029` (`waitForSyncJob`)

## Symptôme

Import complet d'un gros tenant (Auxerre : 18 shops, ~28 791 lignes rien que pour
`WeezeventTransactionItem`, cf. fiche back 105) sur une instance neuve : l'utilisateur voit l'erreur
`intgSyncProgTimeout` ("La synchronisation a dépassé le délai maximal — cela prend trop de temps,
contactez le support") alors que le job de sync côté backend n'a jamais échoué et continue de
tourner (aucun appel d'annulation n'est envoyé par le frontend à ce timeout — le code se contente
d'arrêter le polling et de marquer l'état local `FAILED`).

## Cause racine

BUG-206 et BUG-218 avaient ajouté, à raison, un plafond `MAX_WAIT_MS = 10 * 60 * 1000` dans les 3
boucles de polling ci-dessus pour éviter un polling infini sur un job réellement bloqué (worker
orphelin, insert-worker planté…). Mais ce plafond mesurait une **durée totale écoulée depuis le
début du polling**, sans tenir compte du fait que le job progressait activement ou non. Un tenant
volumineux comme Auxerre peut légitimement mettre plus de 10 minutes à collecter/insérer
l'intégralité de son historique (surtout combiné à la bissection de collecte alors séquentielle côté
backend, cf. BUG-112) — le seuil se déclenchait donc aussi bien sur un job sain-mais-lent que sur un
job réellement mort, sans savoir distinguer les deux cas.

## Correction

Remplacé le timeout de **durée totale** par un timeout d'**inactivité** dans les 3 pollers : à
chaque tick, une signature de progression est comparée à la précédente —
`totalCollected|totalInserted|processedChunks` pour le sync Weezevent (widget flottant + dialog),
`current|percentage` pour le job d'agrégation (`StepProcessTimeline.waitForSyncJob`, alimenté par
`GET /aggregation/progress/:jobId`). Si la signature change, l'horloge d'abandon
(`lastProgressAt`) est repoussée à maintenant. Le job n'est déclaré `FAILED`/abandonné que si
**aucun progrès n'a été constaté pendant `MAX_STALL_MS` (10 min) d'affilée**, quelle que soit la
durée totale déjà écoulée.

Résultat : un job qui avance, même lentement, n'est jamais coupé artificiellement ; un job
réellement bloqué (aucune progression) est toujours détecté en 10 minutes, comme avant — c'est
l'objectif d'origine de BUG-206, simplement mieux ciblé.

## Risque de régression / à surveiller

- Vérifier qu'un job réellement bloqué (stub un worker mort en dev) déclenche toujours le timeout en
  ~10 min — ne pas avoir cassé la protection de BUG-206/218 en la rendant "infinie" par erreur (une
  signature qui ne change jamais doit bien laisser `lastProgressAt` figé).
- Les 3 constantes (`MAX_STALL_MS` dans les 2 premiers fichiers, `SYNC_JOB_POLL_MAX_STALL_MS` dans
  le 3e) restent dupliquées entre 3 fichiers, toujours pas factorisées (dette déjà notée par BUG-206
  et BUG-218 — un composable `useJobPolling` commun reste à faire).
- Signal de progression fragile par construction : si le backend retourne une valeur qui régresse ou
  stagne à tort (bug côté backend), le job serait déclaré bloqué à tort après 10 min même s'il
  avance réellement en base — pas de garde supplémentaire ajoutée pour ce cas, jugé hors scope de ce
  correctif.
- Corrélé au fix backend BUG-112 (parallélisation de la bissection de collecte) : combinés, la
  collecte devrait de toute façon aller assez vite pour qu'un gros tenant n'atteigne quasiment
  jamais ce seuil d'inactivité en pratique.

## Références

- BUG-206 (introduction du timeout initial, durée totale), BUG-217/218 (même famille de polling non
  borné/non annulé dans `StepProcessTimeline.vue`).
- Fiche miroir back : [`api-datafriday-staging/docs/bugs/112_...`](../../../backend/docs/bugs/112_weezevent_bissection_collecte_sequentielle_timeout_gros_tenant.md).
