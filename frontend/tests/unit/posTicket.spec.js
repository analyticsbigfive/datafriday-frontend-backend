import { buildTicketLines, ticketTotals, vatOfCents, cartCountsByCategory, buildSalePayload } from '@/utils/posTicket'

const items = [
  { menuItemId: 'beer', name: 'Bière', categoryId: 'drinks', unitPrice: 4, originalUnitPrice: null, vatRate: 20 },
  { menuItemId: 'menu', name: 'Menu', categoryId: 'menus', unitPrice: 14, originalUnitPrice: 15, vatRate: 10 },
  { menuItemId: 'deposit', name: 'Consigne', categoryId: 'deposit', unitPrice: 1, originalUnitPrice: null, vatRate: 0 },
  { menuItemId: 'refund', name: 'Déconsigne', categoryId: 'deposit', unitPrice: -1, originalUnitPrice: null, vatRate: 0 },
]

describe('posTicket', () => {
  it('construit les lignes dans l ordre du catalogue et ignore les articles disparus', () => {
    const lines = buildTicketLines({ menu: 1, beer: 2, ghost: 3 }, items)
    expect(lines.map((l) => l.menuItemId)).toEqual(['beer', 'menu'])
    expect(lines[0]).toMatchObject({ quantity: 2, unitCents: 400, totalCents: 800 })
    expect(lines[1].originalUnitCents).toBe(1500)
  })

  it('la déconsigne est une ligne négative qui vient en déduction du total', () => {
    const lines = buildTicketLines({ beer: 1, refund: 2 }, items)
    expect(lines.find((l) => l.menuItemId === 'refund').totalCents).toBe(-200)
    expect(ticketTotals(lines).totalCents).toBe(200)
  })

  it('un ticket qui ne contient que des déconsignes est négatif', () => {
    expect(ticketTotals(buildTicketLines({ refund: 3 }, items)).totalCents).toBe(-300)
  })

  it('calcule la TVA contenue (TTC), nulle sur la consigne', () => {
    expect(vatOfCents(1400, 10)).toBe(127)
    expect(vatOfCents(400, 20)).toBe(67)
    expect(vatOfCents(100, 0)).toBe(0)
    expect(ticketTotals(buildTicketLines({ menu: 1, deposit: 1 }, items)).vatCents).toBe(127)
  })

  it('compte les unités par catégorie', () => {
    expect(cartCountsByCategory({ beer: 2, refund: 1, deposit: 1 }, items)).toEqual({ drinks: 2, deposit: 2 })
  })

  it('prépare le corps de la requête en euros, pourboire seulement s il y en a', () => {
    const lines = buildTicketLines({ beer: 2 }, items)
    const payload = buildSalePayload({
      lines,
      payments: [{ paymentMethodId: 'cash', amountCents: 300, tipCents: 0 }, { paymentMethodId: 'card', amountCents: 500, tipCents: 80 }],
    })
    expect(payload.lines).toEqual([{ menuItemId: 'beer', quantity: 2 }])
    expect(payload.payments).toEqual([{ paymentMethodId: 'cash', amountTtc: 3 }, { paymentMethodId: 'card', amountTtc: 5, tipTtc: 0.8 }])
  })
})
