import {
  createQuotaSafeStorage,
  pruneIfNearQuota,
  evictTier,
  isQuotaError,
  EVICTION_TIERS,
} from '@/utils/storageQuota'

// Storage en mémoire avec un quota en caractères, pour rejouer le cas réel : caches
// Event Predict qui remplissent le localStorage, session Supabase refusée.
function fakeStorage(quota = Infinity) {
  const map = new Map()
  const used = () => [...map].reduce((s, [k, v]) => s + k.length + v.length, 0)
  return {
    get length() { return map.size },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    removeItem: (k) => { map.delete(k) },
    setItem: (k, v) => {
      const prev = map.has(k) ? k.length + map.get(k).length : 0
      if (used() - prev + k.length + String(v).length > quota) {
        const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e
      }
      map.set(k, String(v))
    },
    _map: map,
  }
}

const SESSION_KEY = 'sb-alsgdtewqeldrrquypdy-auth-token'
const SESSION = JSON.stringify({ access_token: 'x'.repeat(200) })

describe('storageQuota (session Supabase prioritaire sur les caches)', () => {
  it('reconnaît les erreurs de quota des navigateurs', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true)
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
    expect(isQuotaError({ name: 'TypeError' })).toBe(false)
  })

  it('stockage plein de caches : purge le pont Event Predict puis enregistre la session', () => {
    const ls = fakeStorage(1000)
    ls.setItem('datafriday:predicted-records:s:e1:current', 'r'.repeat(700))
    ls.setItem('analyse:event-predict-active-version:e1', '{"activeVersionId":"v1"}')
    const storage = createQuotaSafeStorage(ls)
    storage.setItem(SESSION_KEY, SESSION)
    expect(ls.getItem(SESSION_KEY)).toBe(SESSION)
    expect(ls.getItem('datafriday:predicted-records:s:e1:current')).toBeNull()
    // Hors caches : jamais purgé.
    expect(ls.getItem('analyse:event-predict-active-version:e1')).not.toBeNull()
  })

  it('palier 1 insuffisant : purge aussi le miroir des versions', () => {
    const ls = fakeStorage(1000)
    ls.setItem('analyse:event-predict-versions:e1', 'v'.repeat(750))
    createQuotaSafeStorage(ls).setItem(SESSION_KEY, SESSION)
    expect(ls.getItem(SESSION_KEY)).toBe(SESSION)
    expect(ls.getItem('analyse:event-predict-versions:e1')).toBeNull()
  })

  it('rien de purgeable : l\'erreur de quota remonte (pas de faux succès)', () => {
    const ls = fakeStorage(100)
    ls.setItem('autre', 'z'.repeat(90))
    expect(() => createQuotaSafeStorage(ls).setItem(SESSION_KEY, SESSION)).toThrow('quota')
  })

  it('purge préventive au démarrage seulement au-delà du seuil', () => {
    const ls = fakeStorage()
    ls.setItem('datafriday:predicted-records:s:e1:current', 'r'.repeat(50))
    expect(pruneIfNearQuota(ls, 1000)).toBe(0)
    expect(pruneIfNearQuota(ls, 10)).toBe(1)
    expect(ls.length).toBe(0)
  })

  it('evictTier ne touche que les préfixes du palier', () => {
    const ls = fakeStorage()
    ls.setItem('analyse:market-prices-cache', '[]')
    ls.setItem('analyse:space-inventory-counts:s:e', '{}')
    evictTier(ls, EVICTION_TIERS[0])
    expect(ls.getItem('analyse:market-prices-cache')).toBeNull()
    expect(ls.getItem('analyse:space-inventory-counts:s:e')).toBe('{}')
  })
})
