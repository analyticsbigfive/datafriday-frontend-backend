import { buildSalesCsv, csvCell } from './pos-sales-csv';

describe('buildSalesCsv', () => {
  const row: any = {
    id: 's1', ticketNumber: 12, createdAt: '2099-01-10T20:00:00.000Z', elementId: 'e', pdvName: 'Buvette; Nord', vendorName: '=Awa',
    payments: [{ paymentMethodId: 'p', name: 'Carte', kind: 'card', amountTtc: 7.5 }], totalTtc: 7.5, vatTotal: 1.25, tipTotal: 1, cancelled: false, syncStatus: 'synced',
    lines: [{ menuItemId: 'm', name: 'Bière "blonde"', quantity: 2, unitPrice: 3.75, totalTtc: 7.5, vatRate: 20 }],
  };

  it('BOM UTF-8, séparateur ;, décimales à virgule, retours ligne CRLF', () => {
    const csv = buildSalesCsv([row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, line] = csv.slice(1).split('\r\n');
    expect(header.split(';')).toHaveLength(10);
    expect(line).toContain(';7,50;1,25;1,00;Valide;');
    expect(line).toContain('Carte 7,50');
  });

  it('protège séparateur, guillemets et formules tableur', () => {
    const line = buildSalesCsv([row]).split('\r\n')[1];
    expect(line).toContain('"Buvette; Nord"');
    expect(line).toContain("'=Awa");
    expect(line).toContain('"2 x Bière ""blonde"""');
    expect(csvCell('-5,00')).toBe('-5,00');
  });
});
