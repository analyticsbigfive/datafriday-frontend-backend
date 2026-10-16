import { computeTipCents, attachTipToLastPayment, tipPercent, tipAmount, POS_TIP_NONE, isSameTipChoice } from '@/utils/posTip'

describe('posTip : pourboire', () => {
  it('calcule un pourcentage du total TTC, arrondi au centime', () => {
    expect(computeTipCents(1400, tipPercent(10))).toBe(140)
    expect(computeTipCents(1400, tipPercent(5))).toBe(70)
    expect(computeTipCents(333, tipPercent(10))).toBe(33)
    expect(computeTipCents(335, tipPercent(10))).toBe(34)
  })

  it('un montant libre est repris tel quel', () => {
    expect(computeTipCents(1400, tipAmount(200))).toBe(200)
  })

  it('aucun pourboire par défaut', () => {
    expect(computeTipCents(1400, POS_TIP_NONE)).toBe(0)
    expect(computeTipCents(1400, null)).toBe(0)
  })

  it('zéro si les pourboires sont désactivés pour l évènement', () => {
    expect(computeTipCents(1400, tipPercent(10), false)).toBe(0)
    expect(computeTipCents(1400, tipAmount(200), false)).toBe(0)
  })

  it('une déconsigne (ticket négatif ou nul) ne porte pas de pourboire', () => {
    expect(computeTipCents(-100, tipAmount(100))).toBe(0)
    expect(computeTipCents(0, tipPercent(10))).toBe(0)
  })

  it('est porté par le dernier paiement seulement', () => {
    const payments = [{ paymentMethodId: 'a', amountCents: 1133 }, { paymentMethodId: 'b', amountCents: 1133 }, { paymentMethodId: 'c', amountCents: 1134 }]
    const out = attachTipToLastPayment(payments, 340)
    expect(out.map((p) => p.tipCents)).toEqual([0, 0, 340])
    expect(out.map((p) => p.amountCents)).toEqual([1133, 1133, 1134])
    expect(attachTipToLastPayment([{ paymentMethodId: 'a', amountCents: 500 }], 50)[0].tipCents).toBe(50)
  })

  it('compare deux choix', () => {
    expect(isSameTipChoice(tipPercent(5), tipPercent(5))).toBe(true)
    expect(isSameTipChoice(tipPercent(5), tipPercent(10))).toBe(false)
    expect(isSameTipChoice(tipAmount(100), tipPercent(100))).toBe(false)
    expect(isSameTipChoice(POS_TIP_NONE, POS_TIP_NONE)).toBe(true)
  })
})
