import {
  FORECAST_MODIFICATION_TYPES as T,
  PERCAP_MODES,
  PCT_MIN,
  PCT_MAX,
  createModification,
  validateModification,
  clampPercent,
  modificationKey,
  addModification,
  removeModification,
  canApplyModifications,
  effectiveModifications,
  leverFactors,
} from '@/utils/forecastModificationModel'

const mod = (type, fields) => createModification(type, fields)

describe('constantes', () => {
  it('expose les 6 types, les modes percap et les bornes', () => {
    expect(Object.values(T).sort()).toEqual(
      ['basket', 'categoryPct', 'itemPrice', 'percap', 'transformation', 'typePct'],
    )
    expect(Object.values(PERCAP_MODES).sort()).toEqual(['basket', 'transformation'])
    expect(PCT_MIN).toBe(-100)
    expect(PCT_MAX).toBe(100)
  })
})

describe('createModification', () => {
  it('génère des identifiants uniques', () => {
    const ids = new Set(Array.from({ length: 200 }, () => mod(T.BASKET, { value: 5 }).id))
    expect(ids.size).toBe(200)
  })

  it('ne retient que les champs utiles au type', () => {
    expect(mod(T.ITEM_PRICE, { target: 42, value: 3.5, mode: 'basket' })).toMatchObject({
      type: 'itemPrice', target: '42', value: 3.5, mode: null,
    })
    expect(mod(T.TRANSFORMATION, { target: 'x', value: 10 })).toMatchObject({ target: null, mode: null })
    expect(mod(T.PERCAP, { mode: 'basket', value: 10 })).toMatchObject({ target: null, mode: 'basket' })
  })

  it('convertit une chaîne numérique en nombre, garde le reste tel quel', () => {
    expect(mod(T.BASKET, { value: '12' }).value).toBe(12)
    expect(mod(T.BASKET, { value: 'abc' }).value).toBe('abc')
    expect(mod(T.BASKET, {}).value).toBeNull()
  })
})

describe('validateModification', () => {
  it('accepte une modification de chaque type', () => {
    expect(validateModification(mod(T.ITEM_PRICE, { target: 'a', value: 0 }))).toEqual({ valid: true, reason: null })
    expect(validateModification(mod(T.CATEGORY_PCT, { target: 'Bières', value: -100 })).valid).toBe(true)
    expect(validateModification(mod(T.TYPE_PCT, { target: 'Boisson', value: 100 })).valid).toBe(true)
    expect(validateModification(mod(T.TRANSFORMATION, { value: 0 })).valid).toBe(true)
    expect(validateModification(mod(T.PERCAP, { mode: 'transformation', value: 5 })).valid).toBe(true)
    expect(validateModification(mod(T.BASKET, { value: -20 })).valid).toBe(true)
  })

  it('rejette un type inconnu et une entrée non objet', () => {
    expect(validateModification(null).reason).toBe('invalid')
    expect(validateModification('x').reason).toBe('invalid')
    expect(validateModification({ type: 'nope', value: 1 }).reason).toBe('invalid-type')
  })

  it('rejette une cible manquante pour les types ciblés', () => {
    expect(validateModification(mod(T.ITEM_PRICE, { value: 5 })).reason).toBe('missing-target')
    expect(validateModification(mod(T.CATEGORY_PCT, { target: '  ', value: 5 })).reason).toBe('missing-target')
    expect(validateModification(mod(T.TYPE_PCT, { value: 5 })).reason).toBe('missing-target')
  })

  it('rejette un mode percap invalide', () => {
    expect(validateModification(mod(T.PERCAP, { value: 5 })).reason).toBe('invalid-mode')
    expect(validateModification(mod(T.PERCAP, { mode: 'x', value: 5 })).reason).toBe('invalid-mode')
  })

  it('rejette une valeur absente ou non numérique', () => {
    expect(validateModification(mod(T.BASKET, {})).reason).toBe('invalid-value')
    expect(validateModification(mod(T.BASKET, { value: 'abc' })).reason).toBe('invalid-value')
    expect(validateModification({ type: T.BASKET, value: NaN }).reason).toBe('invalid-value')
  })

  it('bornes : % entre -100 et +100, prix >= 0 sans plafond', () => {
    expect(validateModification(mod(T.BASKET, { value: 100.5 })).reason).toBe('out-of-range')
    expect(validateModification(mod(T.TRANSFORMATION, { value: -100.1 })).reason).toBe('out-of-range')
    expect(validateModification(mod(T.CATEGORY_PCT, { target: 'a', value: 101 })).reason).toBe('out-of-range')
    expect(validateModification(mod(T.ITEM_PRICE, { target: 'a', value: -0.01 })).reason).toBe('out-of-range')
    expect(validateModification(mod(T.ITEM_PRICE, { target: 'a', value: 250 })).valid).toBe(true)
  })
})

describe('clampPercent', () => {
  it('borne entre -100 et 100, non numérique donne 0', () => {
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(-150)).toBe(-100)
    expect(clampPercent(12.5)).toBe(12.5)
    expect(clampPercent('30')).toBe(30)
    expect(clampPercent('abc')).toBe(0)
    expect(clampPercent(null)).toBe(0)
  })
})

describe('modificationKey', () => {
  it('suit les clés de cible de la spec', () => {
    expect(modificationKey(mod(T.ITEM_PRICE, { target: 'm1', value: 1 }))).toBe('itemPrice:m1')
    expect(modificationKey(mod(T.CATEGORY_PCT, { target: 'Bières', value: 1 }))).toBe('categoryPct:Bières')
    expect(modificationKey(mod(T.TYPE_PCT, { target: 'Boisson', value: 1 }))).toBe('typePct:Boisson')
    expect(modificationKey(mod(T.TRANSFORMATION, { value: 1 }))).toBe('transformation')
    expect(modificationKey(mod(T.PERCAP, { mode: 'transformation', value: 1 }))).toBe('percap:transformation')
    expect(modificationKey(mod(T.PERCAP, { mode: 'basket', value: 1 }))).toBe('percap:basket')
    expect(modificationKey(mod(T.BASKET, { value: 1 }))).toBe('basket')
  })

  it('type inconnu ou entrée vide : null', () => {
    expect(modificationKey({ type: 'nope' })).toBeNull()
    expect(modificationKey(null)).toBeNull()
  })
})

describe('addModification / removeModification', () => {
  it('ajoute en fin de liste et renvoie une nouvelle liste', () => {
    const a = mod(T.BASKET, { value: 5 })
    const b = mod(T.TRANSFORMATION, { value: 5 })
    const list = [a]
    const next = addModification(list, b)
    expect(next).toEqual([a, b])
    expect(next).not.toBe(list)
    expect(list).toEqual([a])
  })

  it('re-ajout de même clé : remplace et passe en fin de liste', () => {
    const a = mod(T.BASKET, { value: 5 })
    const b = mod(T.TRANSFORMATION, { value: 5 })
    const a2 = mod(T.BASKET, { value: 20 })
    const next = addModification([a, b], a2)
    expect(next).toEqual([b, a2])
  })

  it('clés différentes sur le même type : cohabitent', () => {
    const p1 = mod(T.PERCAP, { mode: 'transformation', value: 5 })
    const p2 = mod(T.PERCAP, { mode: 'basket', value: 5 })
    const i1 = mod(T.ITEM_PRICE, { target: 'a', value: 3 })
    const i2 = mod(T.ITEM_PRICE, { target: 'b', value: 3 })
    expect(addModification(addModification(addModification([p1], p2), i1), i2)).toHaveLength(4)
  })

  it('liste absente : démarre une liste', () => {
    const a = mod(T.BASKET, { value: 5 })
    expect(addModification(undefined, a)).toEqual([a])
  })

  it('removeModification retire par identifiant sans muter', () => {
    const a = mod(T.BASKET, { value: 5 })
    const b = mod(T.TRANSFORMATION, { value: 5 })
    const list = [a, b]
    expect(removeModification(list, a.id)).toEqual([b])
    expect(list).toHaveLength(2)
    expect(removeModification(list, 'inconnu')).toEqual([a, b])
  })
})

describe('canApplyModifications', () => {
  it('faux pour liste vide, absente ou sans modification valide', () => {
    expect(canApplyModifications([])).toBe(false)
    expect(canApplyModifications(null)).toBe(false)
    expect(canApplyModifications([mod(T.BASKET, { value: 500 })])).toBe(false)
  })

  it('vrai dès qu\'une modification est valide', () => {
    expect(canApplyModifications([mod(T.BASKET, { value: 500 }), mod(T.BASKET, { value: 5 })])).toBe(true)
  })
})

describe('effectiveModifications', () => {
  it('écarte les invalides et garde la dernière de chaque clé, ordre préservé', () => {
    const a = mod(T.CATEGORY_PCT, { target: 'x', value: 10 })
    const b = mod(T.BASKET, { value: 5 })
    const a2 = mod(T.CATEGORY_PCT, { target: 'x', value: 20 })
    const bad = mod(T.TRANSFORMATION, { value: 999 })
    expect(effectiveModifications([a, b, bad, a2])).toEqual([b, a2])
  })
})

describe('leverFactors', () => {
  it('liste vide : facteurs neutres', () => {
    expect(leverFactors([])).toEqual({ volume: 1, basket: 1 })
  })

  it('transformation seule : volume uniquement', () => {
    expect(leverFactors([mod(T.TRANSFORMATION, { value: 10 })])).toEqual({ volume: 1.1, basket: 1 })
  })

  it('basket seul : panier uniquement', () => {
    expect(leverFactors([mod(T.BASKET, { value: -50 })])).toEqual({ volume: 1, basket: 0.5 })
  })

  it('transformation et percap (mode transformation) se multiplient dans le volume', () => {
    const { volume, basket } = leverFactors([
      mod(T.TRANSFORMATION, { value: 10 }),
      mod(T.PERCAP, { mode: 'transformation', value: 10 }),
    ])
    expect(volume).toBeCloseTo(1.21, 10)
    expect(basket).toBe(1)
  })

  it('basket et percap (mode basket) se multiplient dans le panier', () => {
    const { volume, basket } = leverFactors([
      mod(T.BASKET, { value: 10 }),
      mod(T.PERCAP, { mode: 'basket', value: 20 }),
    ])
    expect(volume).toBe(1)
    expect(basket).toBeCloseTo(1.32, 10)
  })

  it('ignore les modifications de prix et les invalides', () => {
    expect(
      leverFactors([
        mod(T.ITEM_PRICE, { target: 'a', value: 3 }),
        mod(T.CATEGORY_PCT, { target: 'c', value: 50 }),
        mod(T.BASKET, { value: 999 }),
      ]),
    ).toEqual({ volume: 1, basket: 1 })
  })

  it('même clé en double dans une liste brute : la dernière l\'emporte', () => {
    const list = [mod(T.TRANSFORMATION, { value: 10 }), mod(T.TRANSFORMATION, { value: 50 })]
    expect(leverFactors(list).volume).toBe(1.5)
  })

  it('-100 % annule le volume', () => {
    expect(leverFactors([mod(T.TRANSFORMATION, { value: -100 })]).volume).toBe(0)
  })
})
