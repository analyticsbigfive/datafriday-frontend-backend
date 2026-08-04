/**
 * BUG-290-01 — le Burger ressortait à 0 prédit / 0 ajusté dans le Stock-up alors
 * que l'écran Menus affichait 95 sur le même shop, à partir de la MÊME donnée
 * (`EventPredictView` passe `activeTimelineData` aux deux sections).
 *
 * Cause : dans la timeline, `menuItemId` porte l'id du PRODUIT DE VENTE
 * (Weezevent) et `mappedMenuItemId` l'id CATALOGUE (`timelineBucketing.js`
 * :174/:204). Le Stock-up n'indexait que par `menuItemId || mappedMenuItemId`
 * et interrogeait avec l'id catalogue → aucun match → 0 → l'article était écarté
 * du stock-up par la garde `adjustedQty === 0`.
 *
 * Ces tests verrouillent les deux moitiés du fix, qui sont indissociables :
 * les clés alias (sinon 0) ET la lecture en MAX (sinon double-comptage).
 */
import {
  buildTimelineQuantityIndex,
  shopLookupKeys,
  itemLookupKeys,
  lookupPredictedQuantity,
} from '@/utils/predictedQuantityIndex'

// Un record de timeline réaliste : les deux ids diffèrent, comme en production
// dès qu'un ProductMapping existe.
const burgerRecord = {
  shopId: 'el-1A',
  shopName: 'Shop 1A',
  menuItemId: 'ext-weez-123', // id produit Weezevent
  mappedMenuItemId: 'mi-burger', // id catalogue
  itemName: 'Burger',
  totalQuantity: 95,
}

const burgerMenuItem = { id: 'mi-burger', name: 'Burger' }

describe('predictedQuantityIndex — BUG-290-01', () => {
  it('retrouve la quantité via l\'id CATALOGUE alors que la timeline porte l\'id Weezevent', () => {
    const index = buildTimelineQuantityIndex([burgerRecord])

    const q = lookupPredictedQuantity(
      index,
      shopLookupKeys({ id: 'el-1A', name: 'Shop 1A' }),
      itemLookupKeys('mi-burger', burgerMenuItem),
    )

    // Avant le fix : 0 (l'index n'avait que la clé `ext-weez-123`).
    expect(q).toBe(95)
  })

  it('ne double-compte PAS quand l\'article matche à la fois par id et par nom', () => {
    // Le piège du fix : l'index range la MÊME quantité sous plusieurs clés.
    // Une lecture qui sommerait les alias sortirait 190 au lieu de 95.
    const index = buildTimelineQuantityIndex([
      { ...burgerRecord, menuItemId: 'mi-burger' }, // id catalogue ET nom présents
    ])

    const q = lookupPredictedQuantity(
      index,
      shopLookupKeys({ id: 'el-1A', name: 'Shop 1A' }),
      itemLookupKeys('mi-burger', burgerMenuItem),
    )

    expect(q).toBe(95)
    expect(q).not.toBe(190)
  })

  it('retrouve la quantité sur une AUTRE config via le nom de shop normalisé', () => {
    // Les records prédits portent le shopId de la config des ventes passées ;
    // l'utilisateur peut afficher une autre config où le même shop physique a un
    // elementId différent. Seul le nom fait le pont.
    const index = buildTimelineQuantityIndex([burgerRecord])

    const q = lookupPredictedQuantity(
      index,
      shopLookupKeys({ id: 'autre-config-el-999', name: 'shop 1a' }),
      itemLookupKeys('mi-burger', burgerMenuItem),
    )

    expect(q).toBe(95)
  })

  it('agrège les minutes du même couple shop × article', () => {
    const index = buildTimelineQuantityIndex([
      { ...burgerRecord, totalQuantity: 60 },
      { ...burgerRecord, totalQuantity: 35 },
    ])

    const q = lookupPredictedQuantity(
      index,
      shopLookupKeys({ id: 'el-1A', name: 'Shop 1A' }),
      itemLookupKeys('mi-burger', burgerMenuItem),
    )

    expect(q).toBe(95)
  })

  it('renvoie 0 pour un article absent de la timeline', () => {
    const index = buildTimelineQuantityIndex([burgerRecord])

    const q = lookupPredictedQuantity(
      index,
      shopLookupKeys({ id: 'el-1A', name: 'Shop 1A' }),
      itemLookupKeys('mi-hotdog', { id: 'mi-hotdog', name: 'Hot-dog' }),
    )

    expect(q).toBe(0)
  })

  it('renvoie 0 sur un index vide sans lever', () => {
    expect(lookupPredictedQuantity(buildTimelineQuantityIndex([]), ['el-1A'], ['mi-burger'])).toBe(0)
    expect(lookupPredictedQuantity(null, ['el-1A'], ['mi-burger'])).toBe(0)
    expect(buildTimelineQuantityIndex(null).size).toBe(0)
  })

  it('ignore un record sans clé shop exploitable', () => {
    const index = buildTimelineQuantityIndex([
      { menuItemId: 'mi-burger', itemName: 'Burger', totalQuantity: 95 },
    ])
    expect(index.size).toBe(0)
  })
})
