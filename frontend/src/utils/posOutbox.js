// File d'envoi des ventes de la caisse POS (PLAN décision 4 : préparation du hors ligne).
//
// Principe : une vente reçoit un `clientTicketId` (UUID v4) à la création, est écrite dans la
// file AVANT l'envoi, puis envoyée. Succès : elle sort de la file. Échec réseau (ou serveur en
// difficulté) : elle reste en file et sera renvoyée par `flush()`. Le serveur est idempotent sur
// `clientTicketId` (un rejeu renvoie la vente avec replayed=true), donc renvoyer ne duplique jamais.
// Une erreur métier (4xx) ne se rejoue pas : l'entrée passe en « refusée » et reste visible.
//
// Stockage isolé derrière `{ load(), save(entries) }` (asynchrone dès la V1) : la V1 garde la file
// en mémoire ; passer à IndexedDB = fournir un autre `storage`, sans toucher aux composants ni au store.

import { isRetryableSendError, posErrorCode } from './posErrors'

/** UUID v4 (le serveur valide `@IsUUID('4')`). crypto.randomUUID si présent, sinon repli getRandomValues puis Math.random. */
export function generateClientTicketId() {
  const c = typeof crypto !== 'undefined' ? crypto : null
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

const clone = (value) => JSON.parse(JSON.stringify(value))

/** Stockage en mémoire (V1). Même contrat qu'un futur stockage IndexedDB. */
export function createMemoryOutboxStorage() {
  let entries = []
  return {
    async load() {
      return clone(entries)
    },
    async save(next) {
      entries = clone(next)
    },
  }
}

/**
 * @param {Object} options
 * @param {(body:Object) => Promise<{sale:Object, replayed:boolean}>} options.send  envoi d'une vente
 * @param {{load:()=>Promise<Object[]>, save:(entries:Object[])=>Promise<void>}} [options.storage]
 * @param {() => string} [options.idGenerator]
 * @param {() => string} [options.now]
 * @param {(entries:Object[]) => void} [options.onChange]  appelé à chaque évolution (file ou refusées)
 *
 * Entrée de file : `{ clientTicketId, body, preview, createdAt, attempts, lastError }`.
 * `preview` est ce que l'interface affiche tant que la vente n'est pas confirmée par le serveur.
 */
export function createPosOutbox({
  send,
  storage = createMemoryOutboxStorage(),
  idGenerator = generateClientTicketId,
  now = () => new Date().toISOString(),
  onChange = () => {},
}) {
  let queue = []
  let rejected = []
  const inFlight = new Set()
  let flushing = null

  const snapshot = () => [
    ...queue.map((entry) => ({ ...entry, status: 'pending' })),
    ...rejected.map((entry) => ({ ...entry, status: 'rejected' })),
  ]

  async function persist() {
    await storage.save(queue)
    onChange(snapshot())
  }

  /** Recharge la file depuis le stockage (au démarrage de la caisse). */
  async function hydrate() {
    queue = await storage.load()
    onChange(snapshot())
    return snapshot()
  }

  function failure(entry, error) {
    entry.attempts += 1
    entry.lastError = { code: posErrorCode(error), status: error?.response?.status ?? null }
  }

  /**
   * Envoie une entrée déjà en file. Résultat :
   *  - `{ outcome: 'sent', entry, result }`   confirmée (ou rejouée) par le serveur, sortie de file
   *  - `{ outcome: 'queued', entry, error }`  échec réseau, reste en file
   *  - `{ outcome: 'rejected', entry, error }` refus métier, sortie de file vers les refusées
   */
  async function attempt(entry) {
    inFlight.add(entry.clientTicketId)
    try {
      const result = await send(entry.body)
      queue = queue.filter((item) => item.clientTicketId !== entry.clientTicketId)
      await persist()
      return { outcome: 'sent', entry, result }
    } catch (error) {
      failure(entry, error)
      if (isRetryableSendError(error)) {
        await persist()
        return { outcome: 'queued', entry, error }
      }
      queue = queue.filter((item) => item.clientTicketId !== entry.clientTicketId)
      rejected = [...rejected, { ...entry }]
      await persist()
      return { outcome: 'rejected', entry, error }
    } finally {
      inFlight.delete(entry.clientTicketId)
    }
  }

  /**
   * Crée une vente (identifiant généré ici), la met en file puis tente l'envoi.
   * @param {{lines:Array, payments:Array, preview?:Object}} sale  `lines` et `payments` au format du contrat
   */
  async function submit({ lines, payments, preview = null }) {
    const clientTicketId = idGenerator()
    const createdAt = now()
    const entry = {
      clientTicketId,
      body: { clientTicketId, clientCreatedAt: createdAt, lines, payments },
      preview: preview ? { ...preview, clientTicketId } : null,
      createdAt,
      attempts: 0,
      lastError: null,
    }
    queue = [...queue, entry]
    await persist()
    return attempt(entry)
  }

  /**
   * Renvoie dans l'ordre les entrées en file qui ne sont pas déjà en cours d'envoi. S'arrête au
   * premier échec réseau (inutile d'insister si le réseau est coupé). Appels concurrents mutualisés.
   */
  function flush() {
    if (flushing) return flushing
    flushing = (async () => {
      const outcomes = []
      try {
        for (const entry of [...queue]) {
          if (inFlight.has(entry.clientTicketId)) continue
          const outcome = await attempt(entry)
          outcomes.push(outcome)
          if (outcome.outcome === 'queued') break
        }
      } finally {
        flushing = null
      }
      return outcomes
    })()
    return flushing
  }

  /** Retire une vente encore en file (annulation avant envoi). Faux si elle est en cours d'envoi ou absente. */
  async function remove(clientTicketId) {
    if (inFlight.has(clientTicketId)) return false
    const before = queue.length
    queue = queue.filter((entry) => entry.clientTicketId !== clientTicketId)
    if (queue.length === before) return false
    await persist()
    return true
  }

  /** Écarte une vente refusée une fois qu'elle a été vue. */
  async function dismissRejected(clientTicketId) {
    rejected = rejected.filter((entry) => entry.clientTicketId !== clientTicketId)
    await persist()
  }

  return {
    hydrate,
    submit,
    flush,
    remove,
    dismissRejected,
    list: snapshot,
    pendingCount: () => queue.length,
    isInFlight: (clientTicketId) => inFlight.has(clientTicketId),
  }
}
