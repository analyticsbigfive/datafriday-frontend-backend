import { retryRequest, settleRequest, isRetryableError } from '@/utils/retryRequest'

const noSleep = jest.fn(() => Promise.resolve())

describe('retryRequest', () => {
  beforeEach(() => noSleep.mockClear())

  it('renvoie la valeur sans retenter si le 1er appel réussit', async () => {
    const fn = jest.fn().mockResolvedValue('ok')
    await expect(retryRequest(fn, { sleep: noSleep })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(noSleep).not.toHaveBeenCalled()
  })

  it('retente sur 5xx puis réussit, avec délais croissants', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValue('ok')
    await expect(retryRequest(fn, { sleep: noSleep })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(noSleep.mock.calls.map((c) => c[0])).toEqual([1500, 4000])
  })

  it('retente sur erreur réseau / timeout (pas de réponse)', async () => {
    const fn = jest.fn().mockRejectedValueOnce({ code: 'ECONNABORTED' }).mockResolvedValue(1)
    await expect(retryRequest(fn, { sleep: noSleep })).resolves.toBe(1)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('ne retente jamais sur 4xx', async () => {
    const err = { response: { status: 404 } }
    const fn = jest.fn().mockRejectedValue(err)
    await expect(retryRequest(fn, { sleep: noSleep })).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('abandonne après 2 essais supplémentaires', async () => {
    const err = { response: { status: 502 } }
    const fn = jest.fn().mockRejectedValue(err)
    await expect(retryRequest(fn, { sleep: noSleep })).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('isRetryableError : annulation non rejouée', () => {
    expect(isRetryableError({ code: 'ERR_CANCELED' })).toBe(false)
    expect(isRetryableError({ response: { status: 429 } })).toBe(false)
  })
})

describe('settleRequest', () => {
  it('distingue échec et vide : value=fallback et error renseignée', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await settleRequest(() => Promise.reject({ response: { status: 404 }, message: 'nf' }), { label: 't', sleep: noSleep })
    expect(res.value).toEqual([])
    expect(res.error).toEqual({ status: 404, message: 'nf' })
    const ok = await settleRequest(() => Promise.resolve([]), { sleep: noSleep })
    expect(ok.error).toBeNull()
  })
})
