import { createDefaultRangePresetCache } from '@/utils/defaultRangePresetCache'

// Storage minimal en mémoire, avec la même surface que localStorage.
const memoryStorage = () => {
  const data = new Map()
  return {
    data,
    getItem: jest.fn((k) => (data.has(k) ? data.get(k) : null)),
    setItem: jest.fn((k, v) => { data.set(k, String(v)) }),
    removeItem: jest.fn((k) => { data.delete(k) }),
  }
}

const boom = () => { throw new Error('storage inaccessible') }

describe('createDefaultRangePresetCache', () => {
  it('renvoie null sans storage ou sans userId (pas d identité, pas de cache)', () => {
    expect(createDefaultRangePresetCache({ storage: null, userId: 'u1' })).toBeNull()
    expect(createDefaultRangePresetCache({ storage: undefined, userId: 'u1' })).toBeNull()
    expect(createDefaultRangePresetCache({ storage: memoryStorage(), userId: null })).toBeNull()
    expect(createDefaultRangePresetCache({ storage: memoryStorage(), userId: undefined })).toBeNull()
    expect(createDefaultRangePresetCache({ storage: memoryStorage(), userId: '' })).toBeNull()
    expect(createDefaultRangePresetCache()).toBeNull()
    expect(createDefaultRangePresetCache({})).toBeNull()
  })

  it('écrit puis relit la période sous la clé du compte', () => {
    const storage = memoryStorage()
    const cache = createDefaultRangePresetCache({ storage, userId: 'u1' })
    expect(cache.read()).toBeNull()
    cache.write('month')
    expect(cache.read()).toBe('month')
    expect(storage.setItem).toHaveBeenCalledWith('analyse:default-range-preset:u1', 'month')
    expect(storage.data.get('analyse:default-range-preset:u1')).toBe('month')
  })

  it('write(null) supprime la clé', () => {
    const storage = memoryStorage()
    const cache = createDefaultRangePresetCache({ storage, userId: 'u1' })
    cache.write('quarter')
    cache.write(null)
    expect(storage.removeItem).toHaveBeenCalledWith('analyse:default-range-preset:u1')
    expect(storage.data.has('analyse:default-range-preset:u1')).toBe(false)
    expect(cache.read()).toBeNull()
  })

  it('write d une valeur vide ou indéfinie supprime aussi la clé (jamais de chaîne vide stockée)', () => {
    const storage = memoryStorage()
    const cache = createDefaultRangePresetCache({ storage, userId: 'u1' })
    cache.write('all')
    cache.write('')
    expect(storage.data.has('analyse:default-range-preset:u1')).toBe(false)
    cache.write('all')
    cache.write(undefined)
    expect(storage.data.has('analyse:default-range-preset:u1')).toBe(false)
    expect(storage.setItem).toHaveBeenCalledTimes(2)
  })

  it('deux userId, deux clés distinctes (aucune fuite d un compte à l autre)', () => {
    const storage = memoryStorage()
    const a = createDefaultRangePresetCache({ storage, userId: 'alice' })
    const b = createDefaultRangePresetCache({ storage, userId: 'bob' })
    a.write('month')
    expect(b.read()).toBeNull()
    b.write('quarter')
    expect(a.read()).toBe('month')
    expect(b.read()).toBe('quarter')
    a.write(null)
    expect(a.read()).toBeNull()
    expect(b.read()).toBe('quarter')
    expect(storage.data.get('analyse:default-range-preset:bob')).toBe('quarter')
  })

  it('une valeur vide ou non textuelle en storage est ignorée à la lecture', () => {
    const storage = memoryStorage()
    const cache = createDefaultRangePresetCache({ storage, userId: 'u1' })
    storage.data.set('analyse:default-range-preset:u1', '')
    expect(cache.read()).toBeNull()
    storage.getItem.mockReturnValueOnce(undefined)
    expect(cache.read()).toBeNull()
    storage.getItem.mockReturnValueOnce(42)
    expect(cache.read()).toBeNull()
  })

  it('getItem qui lève : read renvoie null sans exception', () => {
    const storage = { ...memoryStorage(), getItem: boom }
    const cache = createDefaultRangePresetCache({ storage, userId: 'u1' })
    expect(() => cache.read()).not.toThrow()
    expect(cache.read()).toBeNull()
  })

  it('setItem qui lève (quota, mode privé) : write ne lève jamais', () => {
    const storage = { ...memoryStorage(), setItem: boom }
    const cache = createDefaultRangePresetCache({ storage, userId: 'u1' })
    expect(() => cache.write('month')).not.toThrow()
  })

  it('removeItem qui lève : write(null) ne lève jamais', () => {
    const storage = { ...memoryStorage(), removeItem: boom }
    const cache = createDefaultRangePresetCache({ storage, userId: 'u1' })
    expect(() => cache.write(null)).not.toThrow()
  })
})
