import { apiOrMock, shouldFallback } from '@/api/apiOrMock'

describe('apiOrMock', () => {
  it('returns real API payload on success (no _fromMock flag)', async () => {
    const real = { foo: 'bar' }
    const data = await apiOrMock(
      () => Promise.resolve(real),
      () => ({ mocked: true }),
      { label: 'test' },
    )
    expect(data).toEqual({ foo: 'bar' })
    expect(data._fromMock).toBeUndefined()
  })

  it('falls back to mock on network error', async () => {
    const err = new Error('Network down') // no `response`
    const data = await apiOrMock(
      () => Promise.reject(err),
      () => ({ mocked: true }),
      { label: 'test' },
    )
    expect(data.mocked).toBe(true)
    expect(data._fromMock).toBe(true)
  })

  it('falls back to mock on 500', async () => {
    const err = { response: { status: 500 } }
    const data = await apiOrMock(
      () => Promise.reject(err),
      () => ({ ok: true }),
    )
    expect(data._fromMock).toBe(true)
  })

  it('falls back on timeout (ECONNABORTED)', async () => {
    const err = { code: 'ECONNABORTED' }
    const data = await apiOrMock(
      () => Promise.reject(err),
      () => ({ ok: true }),
    )
    expect(data._fromMock).toBe(true)
  })

  it('does NOT fall back on 401', async () => {
    const err = { response: { status: 401 } }
    await expect(
      apiOrMock(() => Promise.reject(err), () => ({ ok: true })),
    ).rejects.toBe(err)
  })

  it('does NOT fall back on 403', async () => {
    const err = { response: { status: 403 } }
    await expect(
      apiOrMock(() => Promise.reject(err), () => ({ ok: true })),
    ).rejects.toBe(err)
  })

  it('shouldFallback matrix', () => {
    expect(shouldFallback({ response: { status: 401 } })).toBe(false)
    expect(shouldFallback({ response: { status: 403 } })).toBe(false)
    expect(shouldFallback({ response: { status: 404 } })).toBe(true)
    expect(shouldFallback({ response: { status: 500 } })).toBe(true)
    expect(shouldFallback({ response: { status: 502 } })).toBe(true)
    expect(shouldFallback({ code: 'ECONNABORTED' })).toBe(true)
    expect(shouldFallback(new Error('network'))).toBe(true)
  })
})
