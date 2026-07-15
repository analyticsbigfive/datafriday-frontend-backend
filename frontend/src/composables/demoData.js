/**
 * Données de démonstration — utilisées si l'API est indisponible.
 * Calibrées pour ressembler aux chiffres de la maquette (Adidas Arena).
 */

const SHOPS = [
  { name: '5 - Comptoir Sud', type: 'food, beverages', area: 'Ground Floor' },
  { name: '3 - Burger Sud', type: 'food', area: 'Ground Floor' },
  { name: '8 - Container (Paris)', type: 'food, beverages', area: 'Ground Floor' },
  { name: '2 - Burger Nord', type: 'food', area: 'Ground Floor' },
  { name: '6 - Bodega (RDC)', type: 'beverages, beer', area: 'Ground Floor' },
  { name: '1 - MHD', type: 'food, beverages', area: 'Forecourt' },
  { name: '4 - Bud', type: 'beverages', area: 'Forecourt' },
  { name: '9 - Fosse', type: 'beverages, beer', area: 'Ground Floor' },
  { name: '7 - Click & Collect (RDC)', type: 'food, beverages', area: 'Ground Floor' },
  { name: 'N3 SUD', type: 'beverages', area: 'Ground Floor' },
  { name: 'N3 TERRASSE', type: 'beverages', area: 'Ground Floor' },
  { name: 'Module 2 (Ouest)', type: 'food, beverages', area: 'Forecourt' },
  { name: 'Module 3 (Sud/Sud)', type: 'food, beverages', area: 'Forecourt' },
  { name: 'N3 NORD', type: 'beverages', area: 'Ground Floor' },
  { name: 'Bar à Champagne', type: 'beverages', area: 'Ground Floor' },
  { name: 'Dinette 3 (Sud Sud)', type: 'food', area: 'Forecourt' },
  { name: 'Déssoiffeurs', type: 'beverages', area: 'Forecourt' },
  { name: 'Bar à Cocktail / Bar à vin', type: 'beverages', area: 'Ground Floor' },
  { name: 'Module 4 RDC', type: 'food, beverages', area: 'Forecourt' },
  { name: 'Dinette Fosse', type: 'food', area: 'Ground Floor' },
  { name: 'Module 1 (MHD)', type: 'food, beverages', area: 'Forecourt' },
  { name: 'Dinette Crêpes', type: 'food', area: 'Forecourt' },
  { name: 'Dinette 2 (Burger Nord)', type: 'food', area: 'Forecourt' },
]

const MENU_ITEMS = [
  { name: 'Budweiser 45cl', type: 'Beverage', category: 'Beer', price: 9, cost: 2.2 },
  { name: 'Frites', type: 'Food', category: 'Sides', price: 6, cost: 1.2 },
  { name: 'Burger Pulled Chicken', type: 'Food', category: 'Main', price: 14, cost: 4.1 },
  { name: 'Hot Dog', type: 'Food', category: 'Main', price: 10, cost: 2.8 },
  { name: 'Coca-Cola BB 50cl', type: 'Beverage', category: 'Soft Drink', price: 5, cost: 0.9 },
  { name: 'Eau plate 50cl', type: 'Beverage', category: 'Water', price: 4, cost: 0.5 },
  { name: 'Champagne flûte', type: 'Beverage', category: 'Champagne', price: 15, cost: 4 },
  { name: 'Cocktail Mojito', type: 'Beverage', category: 'Mixology', price: 12, cost: 3 },
  { name: 'Combo Burger + Frites', type: 'Combo', category: 'Combo', price: 18, cost: 5.5 },
  { name: 'Verre réutilisable', type: 'Glasses', category: 'Glasses', price: 2, cost: 0.6 },
  { name: 'Heineken 33cl', type: 'Beverage', category: 'Beer', price: 8, cost: 1.9 },
]

const EVENT_TEMPLATES = [
  { name: 'Afreudh', date: '2026-04-18', color: '#5B8DEF' },
  { name: 'Meeting Politique', date: '2026-04-12', color: '#66BB6A' },
  { name: 'ARES 40', date: '2026-04-02', color: '#FF8A65' },
  { name: 'PSB vs Maccabi', date: '2026-03-30', color: '#AB47BC' },
  { name: 'PSB vs Nanterre', date: '2026-03-28', color: '#EF5350' },
  { name: 'PSB vs Milan', date: '2026-03-20', color: '#FFD54F' },
  { name: 'Coupe de France de Volley', date: '2026-03-15', color: '#4DD0E1' },
]

function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function buildDemoData() {
  const rand = seededRandom(42)
  const events = []
  const records = []

  // Générer 44 événements pour matcher la maquette
  for (let i = 0; i < 44; i++) {
    const tpl = EVENT_TEMPLATES[i % EVENT_TEMPLATES.length]
    const id = `evt-${i + 1}`
    const date = new Date(2026, 0 + (i % 12), 1 + (i % 27)).toISOString().slice(0, 10)
    events.push({ id, name: `${tpl.name} #${i + 1}`, date, color: tpl.color })

    for (const shop of SHOPS) {
      // Nombre de menu items par shop aléatoire (2-6)
      const nItems = 2 + Math.floor(rand() * 5)
      const items = [...MENU_ITEMS].sort(() => rand() - 0.5).slice(0, nItems)
      for (const it of items) {
        const qty = Math.floor(rand() * 300) + 20
        records.push({
          elementId: `${shop.name}-${it.name}-${id}`,
          menuItemId: it.name,
          menuItemName: it.name,
          menuItemType: it.type,
          menuItemCategory: it.category,
          shopName: shop.name,
          shopType: shop.type,
          shopArea: shop.area,
          revenue: qty * it.price,
          quantity: qty,
          transactionCount: Math.ceil(qty / 2.3),
          eventId: id,
          eventName: `${tpl.name} #${i + 1}`,
          eventDate: date,
        })
      }
    }
  }

  const costMap = {}
  for (const it of MENU_ITEMS) costMap[it.name] = it.cost
  return { events, records, costMap }
}

const DEMO = buildDemoData()

export const DEMO_SPACE = {
  id: 'demo-space',
  name: 'Adidas Arena',
  type: 'Arena',
}
export const DEMO_EVENTS = DEMO.events
export const DEMO_SHOP_GRANULAR = DEMO.records
export const DEMO_COST_MAP = DEMO.costMap
