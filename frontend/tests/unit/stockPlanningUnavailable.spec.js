/**
 * BUG-291-02 — un article au menu du PDV mais IMPOSSIBLE À PRODUIRE côté serveur
 * (pas de recette, ingrédient inactif / sans fournisseur, ou fournisseur ne
 * livrant pas l'espace) ne doit générer AUCUNE ligne de réarmement, ni pour lui
 * ni pour ses ingrédients : on ne réarme pas ce qu'on ne peut pas fabriquer.
 *
 * Le Réarmement est une chaîne de calcul SÉPARÉE d'Event Predict
 * (`buildStockRequirements` / `buildMenuItemDemand`) : les gardes posées dans les
 * composants Event Predict ne l'atteignent pas, d'où ces tests dédiés.
 *
 * Correctif v2 : `unavailableItems` est un index PLAT `{ ids, names }` au niveau
 * ESPACE — `available` est calculé par espace côté serveur, et la jointure par
 * nom de shop de la v1 ratait en silence sur les configs synthétiques.
 */
import { buildStockRequirements, buildMenuItemDemand } from '@/utils/stockPlanning'

// Deux plats du même PDV. Le Cookie est indisponible (pas de recette côté
// serveur) ; le Burger, lui, est produisible et doit rester intact.
const menuItems = [
  {
    id: 'mi-burger',
    name: 'Burger 25/26 (Aux)',
    readyForSale: 'No',
    numberOfPiecesRecipe: 1,
    components: [
      {
        id: 'line-burger-pain',
        sourceId: 'ing-pain',
        name: 'Pain burger',
        unit: 'unit',
        numberOfUnits: 1,
        itemType: 'Ingredient',
      },
    ],
  },
  {
    id: 'mi-cookie',
    name: 'Cookie',
    readyForSale: 'No',
    numberOfPiecesRecipe: 1,
    components: [
      {
        id: 'line-cookie-farine',
        sourceId: 'ing-farine',
        name: 'Farine',
        unit: 'kg',
        numberOfUnits: 0.05,
        itemType: 'Ingredient',
      },
    ],
  },
]

const configuration = {
  data: {
    floors: [{ elements: [{ id: 'shop-1', name: 'Bar Nord', type: 'shop' }] }],
  },
}

const predictedRecords = [
  { shopId: 'shop-1', menuItemId: 'mi-burger', quantity: 95 },
  { shopId: 'shop-1', menuItemId: 'mi-cookie', quantity: 7 },
]

const selectedMenuItems = { 'shop-1': ['mi-burger', 'mi-cookie'] }

const names = (rows) => rows.map((r) => r.itemName).sort()

describe('buildStockRequirements — articles non produisibles (BUG-291-02)', () => {
  it("n'émet aucune ligne pour un article indisponible, même avec une quantité prédite > 0", () => {
    const rows = buildStockRequirements({
      configuration,
      menuItems,
      predictedRecords,
      selectedMenuItems,
      unavailableItems: { ids: ['mi-cookie'], names: ['Cookie'] },
    })
    // Le Cookie prédisait 7 ventes : ni sa ligne ni sa farine ne doivent sortir.
    expect(names(rows)).toEqual(['Pain burger'])
    expect(rows.every((r) => r.itemName !== 'Farine')).toBe(true)
  })

  it('apparie par NOM quand le record porte un id timeline ≠ id catalogue', () => {
    // Cas BUG-290-01 : le record vient de Weezevent (`ext-weez-cookie`) et se
    // rattrape sur le catalogue via `mappedMenuItemId`. L'index d'indisponibilité
    // ne connaît, lui, que l'id catalogue ET le nom.
    const rows = buildStockRequirements({
      configuration,
      menuItems,
      predictedRecords: [
        { shopId: 'shop-1', menuItemId: 'mi-burger', quantity: 95 },
        {
          shopId: 'shop-1',
          menuItemId: 'ext-weez-cookie',
          mappedMenuItemId: 'mi-cookie',
          itemName: 'Cookie',
          quantity: 7,
        },
      ],
      selectedMenuItems: { 'shop-1': ['mi-burger', 'ext-weez-cookie'] },
      unavailableItems: { ids: ['mi-cookie'], names: ['Cookie'] },
    })
    expect(names(rows)).toEqual(['Pain burger'])
  })

  it("exclut par NOM seul, quelle que soit la casse — filet quand aucun id ne matche", () => {
    // Correctif v2 : index PLAT au niveau espace, plus AUCUNE jointure par nom de
    // shop (la v1 en dépendait et ratait en silence sur les configs synthétiques,
    // dont `shop.name` peut être un id brut).
    const rows = buildStockRequirements({
      configuration,
      menuItems,
      predictedRecords,
      selectedMenuItems,
      unavailableItems: { ids: [], names: ['  COOKIE  '] },
    })
    expect(names(rows)).toEqual(['Pain burger'])
  })

  it("s'applique même sur une config SYNTHÉTIQUE (shop.name = id brut)", () => {
    // Le cas réel qui a fait échouer la v1 : `buildSyntheticConfig` pose l'id du
    // shop comme `name` quand les records n'en portent pas.
    const synthConfig = {
      data: {
        floors: [{ elements: [{ id: 'shop-1', name: 'shop-1', type: 'shop' }] }],
      },
    }
    const rows = buildStockRequirements({
      configuration: synthConfig,
      menuItems,
      predictedRecords,
      selectedMenuItems,
      unavailableItems: { ids: ['mi-cookie'], names: ['Cookie'] },
    })
    expect(names(rows)).toEqual(['Pain burger'])
  })

  it('sans `unavailableItems`, la sortie est strictement inchangée', () => {
    const withParam = buildStockRequirements({
      configuration,
      menuItems,
      predictedRecords,
      selectedMenuItems,
      unavailableItems: null,
    })
    const withoutParam = buildStockRequirements({
      configuration,
      menuItems,
      predictedRecords,
      selectedMenuItems,
    })
    expect(names(withParam)).toEqual(['Farine', 'Pain burger'])
    expect(withoutParam).toEqual(withParam)
  })

  it('un article hors index garde toutes ses lignes', () => {
    const rows = buildStockRequirements({
      configuration,
      menuItems,
      predictedRecords,
      selectedMenuItems,
      unavailableItems: { ids: ['mi-autre'], names: ['Croque Monsieur'] },
    })
    expect(names(rows)).toEqual(['Farine', 'Pain burger'])
  })
})

describe('buildMenuItemDemand — parité achat/BOM (BUG-291-02)', () => {
  it("n'achète pas non plus pour un article qu'on ne peut pas produire", () => {
    const demand = buildMenuItemDemand({
      configuration,
      menuItems,
      predictedRecords,
      selectedMenuItems,
      unavailableItems: { ids: ['mi-cookie'], names: ['Cookie'] },
    })
    expect(demand.map((d) => d.menuItemId)).toEqual(['mi-burger'])
    expect(demand[0].quantity).toBe(95)
  })

  it('sans le paramètre, les deux articles restent demandés', () => {
    const demand = buildMenuItemDemand({
      configuration,
      menuItems,
      predictedRecords,
      selectedMenuItems,
    })
    expect(demand.map((d) => d.menuItemId).sort()).toEqual(['mi-burger', 'mi-cookie'])
  })
})
