// Composable Event Predict — gestion des versions (scénarios) par event.
// Vue port de la logique React (EventPredictView.tsx :1087-1635 + 1684).
//
// Persistance (2 couches) :
//   1. API REST NestJS  : /events/{eventId}/predict-versions (+ /predict-versions/{id})
//      → table `EventPredictVersion`. Source autoritaire. Voir
//      src/api/endpoints/eventPredict.api.js + docs/eventPredictVersions.api.md.
//   2. localStorage : miroir/cache offline. Utilisé en mode démo, ET en
//      fallback automatique tant que les routes REST n'existent pas encore
//      (aucune régression : se comporte comme avant tant que l'API renvoie 404).
//
//   La "version active" (en cours d'édition) reste 100% UI/localStorage — ce
//   n'est PAS une donnée métier persistée en base.
//
// Schéma version (front) :
// {
//   id, name, timestamp, eventSnapshot,
//   totalRevenue, adjustedTotalRevenue, perCapita, adjustedPerCapita,
//   menuConfig: { [elementId]: string[] },
//   quantityAdjustments: { [elementId-menuItemId]: percent },
//   selectedPredictionEventIds: string[],
//   selectedTimeRange: { start, end } | null,
//   isDefault?: boolean,
// }

import { ref, shallowRef } from 'vue'
import { isDemoMode } from '@/utils/demoMode'
import {
  listEventPredictVersions,
  createEventPredictVersion,
  updateEventPredictVersion,
  deleteEventPredictVersion,
  setEventPredictDefault,
} from '@/api/endpoints/eventPredict.api'

// Active la persistance REST (table EventPredictVersion).
// ✅ 2026-06-22 : routes backend vérifiées EXISTANTES (probe live → 401 = auth
//    requise, plus de 404) sur GET/POST /events/{id}/predict-versions,
//    PATCH/DELETE /predict-versions/{id}, PUT …/default. Migration Prisma
//    déployée → on bascule sur l'API (source autoritaire). Fallback localStorage
//    conservé automatiquement si un appel échoue (cf. apiAvailable).
const REST_ENABLED = true

// Anti-explosion : signatures de versions DÉJÀ POSTées en BDD pendant cette
// session de page (par eventId). Si le GET backend ne renvoie pas une version
// qu'on vient de créer (bug backend observé : GET /predict-versions = 0 après
// POST), la réconciliation la re-POSTait à CHAQUE load → doublons en cascade.
// On ne POST donc une signature qu'UNE fois par session ; ensuite on la MERGE
// (affichage) sans re-créer. Module-level → persiste à travers les remounts.
const _postedSigByEvent = new Map() // eventId -> Set<signature>

// Logger de diagnostic persistance : indique clairement BDD (API REST) vs
// localStorage pour chaque opération. Retirer une fois la bascule validée.
const TAG = '[EventPredictVersions]'
const logBDD = (op, detail) =>
  console.log(`%c${TAG} 💾 BDD (API REST) — ${op}`, 'color:#16a34a;font-weight:bold', detail ?? '')
const logLS = (op, detail) =>
  console.log(`%c${TAG} 📦 localStorage — ${op}`, 'color:#d97706;font-weight:bold', detail ?? '')

// Préfixe localStorage — évite les collisions avec les autres usages de LS.
const LS_NS = 'analyse:'
const VERSIONS_KEY = (eventId) => `event-predict-versions:${eventId}`
const DEFAULT_VERSION_KEY = (eventId) => `event-predict-default-version:${eventId}`
const ACTIVE_VERSION_KEY = (eventId) => `event-predict-active-version:${eventId}`
const lsKey = (k) => `${LS_NS}${k}`

function lsRead(key) {
  try {
    const raw = localStorage.getItem(lsKey(key))
    if (!raw) return null
    return JSON.parse(raw)
  } catch (_) { return null }
}
function lsWrite(key, value) {
  try { localStorage.setItem(lsKey(key), JSON.stringify(value)) } catch (_) { /* quota */ }
}
function lsDelete(key) {
  try { localStorage.removeItem(lsKey(key)) } catch (_) { /* noop */ }
}

// Signatures POSTées en BDD, PERSISTÉES en localStorage (clé par event). Sans
// ça, `_postedSigByEvent` (mémoire seule) se vide à chaque reload → la
// réconciliation re-POSTait les versions localStorage absentes du GET backend
// (bug GET = vide après POST) → CASCADE DE DOUBLONS (observé : 76 versions).
// Persister survit aux reloads → une signature déjà POSTée n'est jamais recréée.
const POSTED_SIGS_KEY = (eventId) => `event-predict-posted-sigs:${eventId}`
function getSeenSigs(eventId) {
  let s = _postedSigByEvent.get(eventId)
  if (!s) {
    const persisted = lsRead(POSTED_SIGS_KEY(eventId))
    s = new Set(Array.isArray(persisted) ? persisted : [])
    _postedSigByEvent.set(eventId, s)
  }
  return s
}
function addSeenSig(eventId, sig) {
  const s = getSeenSigs(eventId)
  if (!s.has(sig)) {
    s.add(sig)
    lsWrite(POSTED_SIGS_KEY(eventId), [...s])
  }
}

/** Mappe une ligne API (EventPredictVersion) → objet version front. */
function dbToVersion(d) {
  if (!d) return null
  return {
    id: d.id,
    name: d.name,
    timestamp: d.updatedAt || d.createdAt || new Date().toISOString(),
    eventSnapshot: d.eventSnapshot,
    totalRevenue: d.totalRevenue || 0,
    adjustedTotalRevenue: d.adjustedTotalRevenue || 0,
    perCapita: d.perCapita || 0,
    adjustedPerCapita: d.adjustedPerCapita || 0,
    menuConfig: d.menuConfig || {},
    quantityAdjustments: d.quantityAdjustments || {},
    // Quantités absolues manuelles (items prédit=0). Lu depuis l'API dès que le
    // backend expose la colonne `manualQuantities` ; `{}` tant qu'absent.
    manualQuantities: d.manualQuantities || {},
    selectedPredictionEventIds: d.selectedPredictionEventIds || [],
    selectedTimeRange: d.selectedTimeRange || null,
    // Quantités prédites par item (shop+menuItemId) persistées en DB. Le
    // réarmement les lit (via activeVersionForEvent) sans dépendre du pont
    // localStorage → marche cross-device. `[]` tant que le backend n'expose pas
    // la colonne.
    predictedRecords: Array.isArray(d.predictedRecords) ? d.predictedRecords : [],
    isDefault: !!d.isDefault,
  }
}

/** Construit le payload API depuis un objet version front. */
function versionToPayload(v) {
  return {
    name: v.name,
    spaceId: v.eventSnapshot?.spaceId || v.spaceId || null,
    eventSnapshot: v.eventSnapshot,
    totalRevenue: v.totalRevenue || 0,
    adjustedTotalRevenue: v.adjustedTotalRevenue || 0,
    perCapita: v.perCapita || 0,
    adjustedPerCapita: v.adjustedPerCapita || 0,
    menuConfig: v.menuConfig || {},
    quantityAdjustments: v.quantityAdjustments || {},
    // ⚠️ NE PAS envoyer `manualQuantities` tant que le backend ne l'accepte pas :
    // le DTO est en `forbidNonWhitelisted` → 400 "property manualQuantities
    // should not exist" → casse TOUS les saves. Dès que la colonne + le DTO
    // existent (cf. docs/eventPredictVersions-manualQuantities-backend.md),
    // dé-commenter la ligne suivante :
    // manualQuantities: v.manualQuantities || {},
    selectedPredictionEventIds: v.selectedPredictionEventIds || [],
    selectedTimeRange: v.selectedTimeRange || null,
    // N'envoie `predictedRecords` que s'il est NON-VIDE : un snapshot pris avant
    // calcul de la timeline donne [] — l'omettre évite d'écraser des records DB
    // valides lors d'un PATCH (update). Le backend doit whitelister la clé dans
    // son DTO (forbidNonWhitelisted), sinon 400 « should not exist ».
    ...(Array.isArray(v.predictedRecords) && v.predictedRecords.length
      ? { predictedRecords: v.predictedRecords }
      : {}),
  }
}

export function useEventPredictVersions() {
  const versions = shallowRef([])
  const defaultVersionId = ref(null)
  const activeVersionId = ref(null)
  const currentEditingVersionId = ref(null)
  const loading = ref(false)
  const lastError = ref(null)
  // Bascule à false UNIQUEMENT si l'API est réellement injoignable (réseau /
  // timeout / 5xx). Un 404 (ressource absente) ou 4xx (validation) ne doit PAS
  // désactiver l'API pour le reste de la session — sinon une seule version
  // locale non migrée empoisonne toute la persistance BDD.
  let apiAvailable = true

  // True seulement si l'API est down (réseau/timeout/5xx). 404/400/409 = API
  // joignable → on traite l'erreur sans couper la persistance REST.
  function apiIsDown(err) {
    if (!err?.response) return true                 // erreur réseau
    if (err?.code === 'ECONNABORTED') return true   // timeout
    return (err?.response?.status || 0) >= 500       // erreur serveur
  }

  // Single-flight : EventPredictView appelle load() 2× au mount (watcher
  // selectedEventId + loadAll). On coalesce les chargements identiques en vol →
  // un seul GET + une seule réconciliation (sinon double migration = doublons).
  let _loadInFlight = null
  let _loadInFlightEvent = null

  // Ids des versions RÉELLEMENT présentes en BDD (chargées ou créées via POST).
  // setDefault/PUT …/default ne doit cibler QUE ces ids — sinon le backend
  // renvoie 500 « Record to update not found » (version localStorage-only), ce
  // qui flippait apiAvailable=false et déclenchait une cascade de fallbacks +
  // doublons. Une version localStorage non migrée → default en localStorage seul.
  const dbBackedIds = new Set()
  // Single-flight pour setDefault : coalesce les rafales (clics / triggers).
  let _setDefaultInFlight = null

  function genId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  }

  function useApi() {
    // ⚠️ Backend REST EventPredictVersion PAS encore exposé. Tant qu'il ne l'est
    // pas, on reste en localStorage (persistance fiable). Sinon un faux 200
    // (route inconnue → fallback SPA) ferait croire à une sauvegarde et le
    // reload écraserait le localStorage → versions perdues.
    // 👉 Passer REST_ENABLED à true quand les routes existent (cf.
    //    docs/eventPredictVersions.api.md).
    const ok = REST_ENABLED && apiAvailable && !isDemoMode()
    if (!ok) {
      const why = !REST_ENABLED
        ? 'REST_ENABLED=false (flag front)'
        : isDemoMode()
          ? 'mode démo'
          : 'API indisponible (échec précédent → fallback)'
      console.log(`%c${TAG} ➜ route persistance = localStorage (${why})`, 'color:#d97706')
    } else {
      console.log(`%c${TAG} ➜ route persistance = BDD (API REST)`, 'color:#16a34a')
    }
    return ok
  }

  function readActiveFromLS(eventId) {
    const cached = lsRead(ACTIVE_VERSION_KEY(eventId))
    return cached?.activeVersionId || null
  }

  /** Recharge depuis localStorage (démo / fallback). */
  function loadFromLS(eventId) {
    const cachedList = lsRead(VERSIONS_KEY(eventId))
    const cachedDef = lsRead(DEFAULT_VERSION_KEY(eventId))
    const cachedActive = lsRead(ACTIVE_VERSION_KEY(eventId))
    versions.value = Array.isArray(cachedList) ? cachedList : []
    defaultVersionId.value = cachedDef?.defaultVersionId || null
    activeVersionId.value =
      cachedActive?.activeVersionId || defaultVersionId.value || null
  }

  /** Écrit le miroir localStorage (cache offline). */
  function mirrorLS(eventId) {
    lsWrite(VERSIONS_KEY(eventId), versions.value)
    lsWrite(DEFAULT_VERSION_KEY(eventId), { defaultVersionId: defaultVersionId.value })
    lsWrite(ACTIVE_VERSION_KEY(eventId), { activeVersionId: activeVersionId.value })
  }

  /**
   * Réconciliation localStorage → BDD : migre (UNE seule fois) les versions
   * présentes en local mais ABSENTES de la BDD (créées hors-ligne / avant REST).
   * Idempotent : après migration le miroir LS porte les ids serveur → au load
   * suivant elles sont déjà en BDD (match par id) → aucun POST. Les versions
   * déjà en BDD ne sont JAMAIS recréées. Retourne la liste fusionnée.
   */
  // Signature de contenu d'une version — sert à détecter qu'une version locale
  // EST DÉJÀ en BDD sous un autre id (id local ≠ id serveur). Évite de re-POSTer
  // un doublon : on remappe l'id au lieu de créer.
  function versionSignature(v) {
    return [
      v?.name || '',
      Math.round(Number(v?.totalRevenue) || 0),
      Math.round(Number(v?.adjustedTotalRevenue) || 0),
      JSON.stringify(v?.menuConfig || {}),
      JSON.stringify(v?.quantityAdjustments || {}),
    ].join('|')
  }

  async function reconcileLocalToDb(eventId, dbList) {
    const dbIds = new Set(dbList.map((v) => v.id))
    const localList = lsRead(VERSIONS_KEY(eventId))
    const localOnly = (Array.isArray(localList) ? localList : []).filter((v) => v && !dbIds.has(v.id))
    if (!localOnly.length) return dbList

    // Index par signature : une version locale dont le contenu existe déjà en
    // BDD (sous un id serveur différent) est REMAPPÉE, pas recréée → zéro doublon.
    const dbBySig = new Map(dbList.map((v) => [versionSignature(v), v]))
    const seenSigs = getSeenSigs(eventId) // persisté en localStorage (anti-doublons cross-reload)
    const idMap = {}
    const created = []
    let remapped = 0
    let mergedNoPost = 0
    for (const lv of localOnly) {
      const sig = versionSignature(lv)
      const match = dbBySig.get(sig)
      if (match) { idMap[lv.id] = match.id; dbBackedIds.add(match.id); remapped += 1; continue }
      // Déjà POSTée cette session mais absente du GET (backend) → on MERGE la
      // version locale telle quelle (affichage) SANS re-POSTer → anti-explosion.
      if (seenSigs.has(sig)) { created.push(lv); mergedNoPost += 1; continue }
      try {
        const c = dbToVersion(await postVersion(eventId, versionToPayload(lv)))
        if (c) {
          idMap[lv.id] = c.id; dbBackedIds.add(c.id); created.push(c)
          dbBySig.set(sig, c); addSeenSig(eventId, sig)
        } else { created.push(lv) }
      } catch (e) {
        if (apiIsDown(e)) apiAvailable = false
        created.push(lv) // POST KO → on garde la version locale (zéro perte)
        logLS('reconcile — POST échoué, version gardée en local', e?.message || e)
      }
    }
    // Remap des pointeurs locaux (default / active) vers les ids serveur.
    const localDef = (lsRead(DEFAULT_VERSION_KEY(eventId)) || {}).defaultVersionId
    if (localDef && idMap[localDef]) defaultVersionId.value = idMap[localDef]
    const localAct = readActiveFromLS(eventId)
    if (localAct && idMap[localAct]) setActive(eventId, idMap[localAct])
    const postedCount = created.length - mergedNoPost
    console.log(
      `%c${TAG} 🔄 sync local→BDD — ${postedCount} POST, ${remapped} remap, ${mergedNoPost} merge (anti-explosion)`,
      'color:#2563eb;font-weight:bold',
      idMap,
    )
    return [...dbList, ...created]
  }

  /** Charge versions + default version pour un event (single-flight + sync). */
  async function load(eventId) {
    if (!eventId) return
    // Coalesce les appels concurrents identiques (double mount/watcher) → 1 GET.
    if (_loadInFlight && _loadInFlightEvent === eventId) return _loadInFlight
    _loadInFlightEvent = eventId
    _loadInFlight = (async () => {
      loading.value = true
      lastError.value = null

      if (!useApi()) {
        loadFromLS(eventId)
        logLS('load() lu depuis localStorage', { eventId, count: versions.value.length })
        loading.value = false
        return
      }

      try {
        const rows = await listEventPredictVersions(eventId)
        let list = (Array.isArray(rows) ? rows : []).map(dbToVersion).filter(Boolean)
        list.forEach((v) => dbBackedIds.add(v.id)) // versions confirmées en BDD
        // SYNC : migre les versions locales absentes de la BDD (idempotent).
        defaultVersionId.value = null
        list = await reconcileLocalToDb(eventId, list)
        versions.value = list
        const dbDefault = (list.find((v) => v.isDefault) || {}).id || null
        defaultVersionId.value =
          dbDefault ||
          defaultVersionId.value ||
          (lsRead(DEFAULT_VERSION_KEY(eventId)) || {}).defaultVersionId ||
          null
        // active = UI/localStorage uniquement (pas en base)
        activeVersionId.value = readActiveFromLS(eventId) || defaultVersionId.value || null
        mirrorLS(eventId)
        logBDD('load() GET /predict-versions + sync OK', { eventId, count: list.length })
      } catch (err) {
        if (apiIsDown(err)) apiAvailable = false
        lastError.value = err
        // NE JAMAIS écraser une liste déjà chargée par un [] sur échec
        // transitoire (401 refresh token, cold-start). Sinon versions.value
        // tombe à 0 → onSaveVersion renomme tout « Version 1 » + onUpdateVersion
        // cible un id absent → upsert POST = explosion de doublons.
        const cached = lsRead(VERSIONS_KEY(eventId))
        if (Array.isArray(cached) && cached.length) {
          loadFromLS(eventId) // cache localStorage utile
        } else if (!versions.value.length) {
          loadFromLS(eventId) // rien en mémoire ni en cache → best effort
        } // sinon : on garde la liste en mémoire, on NE la vide PAS
        logLS('load() — échec API, liste préservée', err?.message || err)
      } finally {
        loading.value = false
        if (_loadInFlightEvent === eventId) {
          _loadInFlight = null
          _loadInFlightEvent = null
        }
      }
    })()
    return _loadInFlight
  }

  // Le backend peut ne PAS (encore) whitelister `predictedRecords` (DTO en
  // forbidNonWhitelisted → 400 « property predictedRecords should not exist »).
  // Plutôt que de casser TOUS les saves, on retire la clé et on REJOUE une fois :
  // le save réussit sans quantités DB (le réarmement retombe sur le pont
  // localStorage). Dès que le backend accepte la clé, la persistance DB des
  // quantités s'active sans changement front.
  function canRetryWithoutPredictedRecords(err, payload) {
    if (!payload || !('predictedRecords' in payload)) return false
    if ((err?.response?.status || 0) !== 400) return false
    const msg = err?.response?.data?.message
    const text = Array.isArray(msg) ? msg.join(' ') : String(msg || '')
    return (
      /predictedRecords/i.test(text) ||
      /should not exist|whitelist|not allowed/i.test(text)
    )
  }
  async function postVersion(eventId, payload) {
    try {
      return await createEventPredictVersion(eventId, payload)
    } catch (err) {
      if (canRetryWithoutPredictedRecords(err, payload)) {
        const { predictedRecords, ...rest } = payload
        void predictedRecords
        return await createEventPredictVersion(eventId, rest)
      }
      throw err
    }
  }
  async function patchVersion(versionId, payload) {
    try {
      return await updateEventPredictVersion(versionId, payload)
    } catch (err) {
      if (canRetryWithoutPredictedRecords(err, payload)) {
        const { predictedRecords, ...rest } = payload
        void predictedRecords
        return await updateEventPredictVersion(versionId, rest)
      }
      throw err
    }
  }

  async function save(eventId, snapshot) {
    const base = {
      name: snapshot.name || `Version ${versions.value.length + 1}`,
      eventSnapshot: snapshot.eventSnapshot,
      totalRevenue: snapshot.totalRevenue || 0,
      adjustedTotalRevenue: snapshot.adjustedTotalRevenue || 0,
      perCapita: snapshot.perCapita || 0,
      adjustedPerCapita: snapshot.adjustedPerCapita || 0,
      menuConfig: snapshot.menuConfig || {},
      quantityAdjustments: snapshot.quantityAdjustments || {},
      // Conservé sur l'objet front + en localStorage (fallback). NON envoyé à
      // l'API tant que le backend ne l'accepte pas (cf. versionToPayload).
      manualQuantities: snapshot.manualQuantities || {},
      selectedPredictionEventIds: snapshot.selectedPredictionEventIds || [],
      selectedTimeRange: snapshot.selectedTimeRange || null,
      // Quantités prédites par item → persistées en DB (versionToPayload ne les
      // sérialise que si non-vide). Source du réarmement cross-device.
      predictedRecords: snapshot.predictedRecords || [],
    }

    if (useApi()) {
      try {
        const created = dbToVersion(await postVersion(eventId, versionToPayload(base)))
        if (created) {
          dbBackedIds.add(created.id)
          addSeenSig(eventId, versionSignature(base)) // anti re-POST au reload
          versions.value = [...versions.value, created]
          currentEditingVersionId.value = created.id
          mirrorLS(eventId)
          logBDD('save() POST /predict-versions OK', { eventId, id: created.id, name: created.name })
          return created
        }
      } catch (err) {
        if (apiIsDown(err)) apiAvailable = false
        lastError.value = err
        logLS('save() — échec API, fallback localStorage', err?.message || err)
      }
    }

    // Fallback localStorage
    const v = { id: genId(), timestamp: new Date().toISOString(), ...base }
    versions.value = [...versions.value, v]
    currentEditingVersionId.value = v.id
    mirrorLS(eventId)
    logLS('save() écrit en localStorage', { eventId, id: v.id, name: v.name })
    return v
  }

  async function update(eventId, versionId, partial) {
    if (useApi()) {
      try {
        // partial = snapshot brut (ne passe PAS par versionToPayload). On
        // n'envoie predictedRecords que NON-VIDE → évite d'écraser des records
        // DB valides avec [] (snapshot pris avant calcul de la timeline).
        const payload = { ...partial }
        if (!(Array.isArray(payload.predictedRecords) && payload.predictedRecords.length)) {
          delete payload.predictedRecords
        }
        const updated = dbToVersion(await patchVersion(versionId, payload))
        if (updated) {
          // Préserve les champs front-only (manualQuantities non renvoyé par
          // l'API ; predictedRecords pas forcément ré-échoé par le backend → on
          // garde l'agrégat fraîchement calculé pour le réarmement).
          const prev = versions.value.find((v) => v.id === versionId) || {}
          const merged = {
            ...prev,
            ...updated,
            manualQuantities: partial.manualQuantities ?? prev.manualQuantities ?? {},
            predictedRecords:
              (Array.isArray(updated.predictedRecords) && updated.predictedRecords.length
                ? updated.predictedRecords
                : null) ??
              (Array.isArray(partial.predictedRecords) && partial.predictedRecords.length
                ? partial.predictedRecords
                : null) ??
              prev.predictedRecords ??
              [],
          }
          versions.value = versions.value.map((v) => (v.id === versionId ? merged : v))
          mirrorLS(eventId)
          logBDD('update() PATCH /predict-versions/{id} OK', { versionId, partial })
          return
        }
      } catch (err) {
        const status = err?.response?.status || 0
        // 404 = version pas (encore) en BDD (créée hors-ligne / id local). UPSERT :
        // on la CRÉE en BDD puis on REMAPPE l'id local → id serveur (refs réactives
        // → composant suit). Anti-doublon via signature. Garantit la persistance
        // BDD immédiate (requise pour rapatrier la version côté réarmement).
        // Garde anti-doublon : on n'UPSERT (POST) que si la version n'est PAS
        // déjà confirmée en BDD. Le backend PATCH /predict-versions/:id marche
        // (vérifié en live : 200, update en place) ; un 404 sur une version
        // db-backed = anomalie transitoire, surtout PAS un enregistrement
        // manquant → re-POSTer créerait un doublon. On retombe alors en
        // localStorage seulement. upsert réservé aux versions locales jamais
        // persistées (1ʳᵉ écriture légitime).
        if (status === 404 && !apiIsDown(err) && !dbBackedIds.has(versionId)) {
          const remapped = await upsertOn404(eventId, versionId, partial)
          if (remapped) return remapped
        }
        if (apiIsDown(err)) apiAvailable = false
        lastError.value = err
        const why = status === 404
          ? '404 (upsert échoué → fallback localStorage)'
          : (err?.message || err)
        logLS('update() — fallback localStorage', why)
      }
    }
    versions.value = versions.value.map((v) =>
      v.id === versionId ? { ...v, ...partial, timestamp: new Date().toISOString() } : v,
    )
    mirrorLS(eventId)
    logLS('update() écrit en localStorage', { versionId, partial })
  }

  /**
   * PATCH 404 → la version n'existe pas en BDD : on la POST (upsert) et on
   * remappe l'id local → id serveur partout (versions, refs active/défaut/édition,
   * dbBackedIds, signatures). Retourne le nouvel id si OK, sinon null (l'appelant
   * retombe en localStorage). manualQuantities reste front-only (non envoyé à l'API).
   */
  async function upsertOn404(eventId, versionId, partial) {
    const prev = versions.value.find((v) => v.id === versionId) || {}
    const merged = { ...prev, ...partial }
    try {
      const created = dbToVersion(await postVersion(eventId, versionToPayload(merged)))
      if (!created) return null
      const next = { ...merged, ...created, manualQuantities: merged.manualQuantities || {} }
      versions.value = versions.value.map((v) => (v.id === versionId ? next : v))
      dbBackedIds.add(created.id)
      addSeenSig(eventId, versionSignature(merged))
      // Remap des ids réactifs (le composant lit ces refs).
      if (currentEditingVersionId.value === versionId) currentEditingVersionId.value = created.id
      if (activeVersionId.value === versionId) {
        activeVersionId.value = created.id
        lsWrite(ACTIVE_VERSION_KEY(eventId), { activeVersionId: created.id })
      }
      if (defaultVersionId.value === versionId) defaultVersionId.value = created.id
      mirrorLS(eventId)
      logBDD('update() 404 → upsert POST OK (id remappé)', { oldId: versionId, newId: created.id })
      return created.id
    } catch (e2) {
      lastError.value = e2
      logLS('update() upsert POST échoué', e2?.message || e2)
      return null
    }
  }

  async function rename(eventId, versionId, name) {
    return update(eventId, versionId, { name })
  }

  async function duplicate(eventId, versionId) {
    const src = versions.value.find((v) => v.id === versionId)
    if (!src) return null
    const copyBase = { ...src, name: `${src.name} (copie)` }
    delete copyBase.id
    delete copyBase.isDefault

    if (useApi()) {
      try {
        const created = dbToVersion(await postVersion(eventId, versionToPayload(copyBase)))
        if (created) {
          dbBackedIds.add(created.id)
          addSeenSig(eventId, versionSignature(copyBase)) // anti re-POST au reload
          versions.value = [...versions.value, created]
          mirrorLS(eventId)
          logBDD('duplicate() POST /predict-versions OK', { eventId, id: created.id })
          return created
        }
      } catch (err) {
        if (apiIsDown(err)) apiAvailable = false
        lastError.value = err
        logLS('duplicate() — échec API, fallback localStorage', err?.message || err)
      }
    }
    const copy = { ...copyBase, id: genId(), timestamp: new Date().toISOString() }
    versions.value = [...versions.value, copy]
    mirrorLS(eventId)
    logLS('duplicate() écrit en localStorage', { eventId, id: copy.id })
    return copy
  }

  async function remove(eventId, versionId) {
    if (useApi()) {
      try {
        await deleteEventPredictVersion(versionId)
        logBDD('remove() DELETE /predict-versions/{id} OK', { versionId })
      } catch (err) {
        // 404 = déjà absent de la BDD (version locale) → suppression locale OK.
        if (apiIsDown(err)) apiAvailable = false
        lastError.value = err
        logLS('remove() — échec API, fallback localStorage', err?.message || err)
      }
    } else {
      logLS('remove() supprime en localStorage', { versionId })
    }
    dbBackedIds.delete(versionId)
    versions.value = versions.value.filter((v) => v.id !== versionId)
    if (defaultVersionId.value === versionId) defaultVersionId.value = null
    if (currentEditingVersionId.value === versionId) currentEditingVersionId.value = null
    if (activeVersionId.value === versionId) activeVersionId.value = null
    mirrorLS(eventId)
  }

  async function setDefault(eventId, versionId) {
    // Single-flight : coalesce les rafales (clics rapides / triggers réactifs)
    // qui sinon lançaient plusieurs PUT concurrents (→ rafale de 500).
    if (_setDefaultInFlight) { try { await _setDefaultInFlight } catch (_) { /* ignore */ } }
    const run = (async () => {
      // N'appeler l'API QUE si la version est réellement en BDD. Une version
      // localStorage-only → PUT …/default = 500 « Record to update not found »
      // (et flippe apiAvailable → cascade de doublons). On la met par défaut en
      // localStorage seulement ; le prochain load() la migrera puis l'API
      // pourra la cibler.
      const isDbBacked = versionId == null || dbBackedIds.has(versionId)
      if (useApi() && isDbBacked) {
        try {
          const res = await setEventPredictDefault(eventId, versionId)
          defaultVersionId.value = res?.defaultVersionId ?? versionId
          versions.value = versions.value.map((v) => ({ ...v, isDefault: v.id === defaultVersionId.value }))
          mirrorLS(eventId)
          logBDD('setDefault() PUT …/default OK', { eventId, versionId })
          return
        } catch (err) {
          if (apiIsDown(err)) apiAvailable = false
          lastError.value = err
          logLS('setDefault() — échec API, fallback localStorage', err?.message || err)
        }
      } else if (useApi() && !isDbBacked) {
        logLS('setDefault() — version pas encore en BDD → localStorage seul', { versionId })
      }
      defaultVersionId.value = versionId
      versions.value = versions.value.map((v) => ({ ...v, isDefault: v.id === versionId }))
      mirrorLS(eventId)
      logLS('setDefault() écrit en localStorage', { eventId, versionId })
    })()
    _setDefaultInFlight = run
    try { await run } finally { if (_setDefaultInFlight === run) _setDefaultInFlight = null }
  }

  async function clearDefault(eventId) {
    if (useApi()) {
      try {
        await setEventPredictDefault(eventId, null)
        defaultVersionId.value = null
        versions.value = versions.value.map((v) => ({ ...v, isDefault: false }))
        mirrorLS(eventId)
        return
      } catch (err) {
        if (apiIsDown(err)) apiAvailable = false
        lastError.value = err
      }
    }
    defaultVersionId.value = null
    versions.value = versions.value.map((v) => ({ ...v, isDefault: false }))
    mirrorLS(eventId)
  }

  // --- Version "active" (en cours d'édition) : UI/localStorage uniquement ---
  function setActive(eventId, versionId) {
    activeVersionId.value = versionId
    currentEditingVersionId.value = versionId
    lsWrite(ACTIVE_VERSION_KEY(eventId), { activeVersionId: versionId })
  }

  function clearActive(eventId) {
    activeVersionId.value = null
    lsDelete(ACTIVE_VERSION_KEY(eventId))
  }

  function getDefault() {
    if (!defaultVersionId.value) return null
    return versions.value.find((v) => v.id === defaultVersionId.value) || null
  }

  function getActive() {
    if (!activeVersionId.value) return null
    return versions.value.find((v) => v.id === activeVersionId.value) || null
  }

  function reset() {
    versions.value = []
    defaultVersionId.value = null
    activeVersionId.value = null
    currentEditingVersionId.value = null
    loading.value = false
    lastError.value = null
    dbBackedIds.clear()
  }

  return {
    versions,
    defaultVersionId,
    activeVersionId,
    currentEditingVersionId,
    loading,
    lastError,
    load,
    save,
    update,
    rename,
    duplicate,
    remove,
    setDefault,
    clearDefault,
    setActive,
    clearActive,
    getDefault,
    getActive,
    reset,
  }
}
