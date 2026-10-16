import { createPosOutbox, createMemoryOutboxStorage, generateClientTicketId } from '@/utils/posOutbox'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const networkError = () => new Error('Network Error')
const httpError = (status, code) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { code } } })
const saleOf = (body, n = 1) => ({ id: `sale-${body.clientTicketId}`, ticketNumber: n, clientTicketId: body.clientTicketId })

const SALE = { lines: [{ menuItemId: 'm1', quantity: 1 }], payments: [{ paymentMethodId: 'p1', amountTtc: 4 }] }

function makeOutbox(send, extra = {}) {
  const changes = []
  const outbox = createPosOutbox({ send, onChange: (entries) => changes.push(entries), ...extra })
  return { outbox, changes }
}

describe('posOutbox : identifiant de ticket', () => {
  it('génère des UUID v4 distincts', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateClientTicketId()))
    expect(ids.size).toBe(50)
    ids.forEach((id) => expect(id).toMatch(UUID_V4))
  })
})

describe('posOutbox : envoi', () => {
  it('envoie la vente avec un clientTicketId et la retire de la file en cas de succès', async () => {
    const send = jest.fn(async (body) => ({ sale: saleOf(body), replayed: false }))
    const { outbox } = makeOutbox(send)
    const result = await outbox.submit(SALE)
    expect(result.outcome).toBe('sent')
    expect(send).toHaveBeenCalledTimes(1)
    const body = send.mock.calls[0][0]
    expect(body.clientTicketId).toMatch(UUID_V4)
    expect(body.lines).toEqual(SALE.lines)
    expect(body.payments).toEqual(SALE.payments)
    expect(typeof body.clientCreatedAt).toBe('string')
    expect(outbox.pendingCount()).toBe(0)
  })

  it('écrit la vente dans la file AVANT l envoi (survit à un plantage en cours de requête)', async () => {
    const storage = createMemoryOutboxStorage()
    let savedDuringSend = null
    const send = jest.fn(async (body) => {
      savedDuringSend = await storage.load()
      return { sale: saleOf(body), replayed: false }
    })
    const { outbox } = makeOutbox(send, { storage })
    await outbox.submit(SALE)
    expect(savedDuringSend).toHaveLength(1)
    expect(await storage.load()).toHaveLength(0)
  })

  it('garde la vente en file sur une erreur réseau', async () => {
    const send = jest.fn().mockRejectedValue(networkError())
    const { outbox } = makeOutbox(send)
    const result = await outbox.submit({ ...SALE, preview: { ticketNumber: 12 } })
    expect(result.outcome).toBe('queued')
    expect(outbox.pendingCount()).toBe(1)
    const [entry] = outbox.list()
    expect(entry.status).toBe('pending')
    expect(entry.attempts).toBe(1)
    expect(entry.preview).toMatchObject({ ticketNumber: 12, clientTicketId: entry.clientTicketId })
  })

  it('rejoue avec LE MÊME clientTicketId puis vide la file', async () => {
    const send = jest.fn().mockRejectedValueOnce(networkError()).mockImplementation(async (body) => ({ sale: saleOf(body), replayed: false }))
    const { outbox } = makeOutbox(send)
    await outbox.submit(SALE)
    const firstId = send.mock.calls[0][0].clientTicketId
    const outcomes = await outbox.flush()
    expect(outcomes.map((o) => o.outcome)).toEqual(['sent'])
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[1][0].clientTicketId).toBe(firstId)
    expect(outbox.pendingCount()).toBe(0)
  })

  it('idempotence : un rejeu reconnu par le serveur (replayed=true) sort de la file sans doublon', async () => {
    const send = jest.fn().mockRejectedValueOnce(networkError()).mockImplementation(async (body) => ({ sale: saleOf(body, 7), replayed: true }))
    const { outbox } = makeOutbox(send)
    await outbox.submit(SALE)
    const [outcome] = await outbox.flush()
    expect(outcome.outcome).toBe('sent')
    expect(outcome.result.replayed).toBe(true)
    expect(outcome.result.sale.ticketNumber).toBe(7)
    expect(outbox.pendingCount()).toBe(0)
    expect(await outbox.flush()).toEqual([])
  })

  it('une erreur 5xx se rejoue, comme un réseau coupé', async () => {
    const send = jest.fn().mockRejectedValueOnce(httpError(503)).mockImplementation(async (body) => ({ sale: saleOf(body), replayed: false }))
    const { outbox } = makeOutbox(send)
    expect((await outbox.submit(SALE)).outcome).toBe('queued')
    expect((await outbox.flush())[0].outcome).toBe('sent')
  })

  it('un refus métier (4xx) ne se rejoue pas : sortie de file, conservé en « refusée »', async () => {
    const send = jest.fn().mockRejectedValue(httpError(400, 'POS_PAYMENT_METHOD_DISABLED'))
    const { outbox } = makeOutbox(send)
    const result = await outbox.submit(SALE)
    expect(result.outcome).toBe('rejected')
    expect(outbox.pendingCount()).toBe(0)
    expect(await outbox.flush()).toEqual([])
    expect(send).toHaveBeenCalledTimes(1)
    const [entry] = outbox.list()
    expect(entry.status).toBe('rejected')
    expect(entry.lastError.code).toBe('POS_PAYMENT_METHOD_DISABLED')
    await outbox.dismissRejected(entry.clientTicketId)
    expect(outbox.list()).toEqual([])
  })
})

describe('posOutbox : renvoi de la file', () => {
  it('renvoie dans l ordre et s arrête au premier échec réseau', async () => {
    const send = jest.fn().mockRejectedValue(networkError())
    const { outbox } = makeOutbox(send)
    await outbox.submit(SALE)
    await outbox.submit(SALE)
    await outbox.submit(SALE)
    send.mockClear()
    const outcomes = await outbox.flush()
    expect(outcomes).toHaveLength(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(outbox.pendingCount()).toBe(3)
  })

  it('envoie tout quand le réseau revient, dans l ordre de création', async () => {
    let online = false
    const sentIds = []
    const send = jest.fn(async (body) => {
      if (!online) throw networkError()
      sentIds.push(body.clientTicketId)
      return { sale: saleOf(body), replayed: false }
    })
    const { outbox } = makeOutbox(send)
    await outbox.submit(SALE)
    await outbox.submit(SALE)
    const queuedIds = outbox.list().map((e) => e.clientTicketId)
    online = true
    const outcomes = await outbox.flush()
    expect(outcomes.map((o) => o.outcome)).toEqual(['sent', 'sent'])
    expect(sentIds).toEqual(queuedIds)
    expect(outbox.pendingCount()).toBe(0)
  })

  it('deux flush simultanés n envoient chaque vente qu une fois', async () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const send = jest.fn()
      .mockRejectedValueOnce(networkError())
      .mockImplementation(async (body) => { await gate; return { sale: saleOf(body), replayed: false } })
    const { outbox } = makeOutbox(send)
    await outbox.submit(SALE)
    const a = outbox.flush()
    const b = outbox.flush()
    release()
    await Promise.all([a, b])
    expect(send).toHaveBeenCalledTimes(2)
    expect(outbox.pendingCount()).toBe(0)
  })

  it('retire une vente encore en file (annulation avant envoi), mais pas pendant son envoi', async () => {
    const send = jest.fn().mockRejectedValue(networkError())
    const { outbox } = makeOutbox(send)
    await outbox.submit(SALE)
    const [{ clientTicketId }] = outbox.list()
    expect(await outbox.remove(clientTicketId)).toBe(true)
    expect(outbox.pendingCount()).toBe(0)
    expect(await outbox.remove(clientTicketId)).toBe(false)

    let release
    const gate = new Promise((resolve) => { release = resolve })
    const slow = jest.fn(async (body) => { await gate; return { sale: saleOf(body), replayed: false } })
    const second = makeOutbox(slow).outbox
    const pending = second.submit(SALE)
    await Promise.resolve()
    await Promise.resolve()
    const inflightId = second.list()[0].clientTicketId
    expect(second.isInFlight(inflightId)).toBe(true)
    expect(await second.remove(inflightId)).toBe(false)
    release()
    await pending
  })
})

describe('posOutbox : stockage isolé', () => {
  it('reprend la file depuis le stockage (futur IndexedDB) et notifie les changements', async () => {
    const storage = createMemoryOutboxStorage()
    const down = jest.fn().mockRejectedValue(networkError())
    await makeOutbox(down, { storage }).outbox.submit(SALE)

    const up = jest.fn(async (body) => ({ sale: saleOf(body), replayed: false }))
    const { outbox, changes } = makeOutbox(up, { storage })
    await outbox.hydrate()
    expect(outbox.pendingCount()).toBe(1)
    expect(changes.at(-1)).toHaveLength(1)
    await outbox.flush()
    expect(await storage.load()).toEqual([])
    expect(changes.at(-1)).toEqual([])
  })
})
