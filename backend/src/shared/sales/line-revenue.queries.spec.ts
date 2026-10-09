import { lineRevenueHtSql, lineRevenueTtcSql } from './line-revenue.queries';

describe('line-revenue.queries', () => {
  it('HT : paiements nets de TVA si la clé payments existe, sinon prix x quantité net de remise, détaxé', () => {
    const sql = lineRevenueHtSql('t', 'ti').sql.replace(/\s+/g, ' ');
    expect(sql).toContain(`t."provider" = 'WEEZEVENT' AND ti."rawData" ? 'payments'`);
    expect(sql).toContain(`(p->>'amount')::numeric - (p->>'amount_vat')::numeric`);
    expect(sql).toContain(`(ti."unitPrice" * ti."quantity" - COALESCE(ti."reduction", 0)) / (1 + ti."vat" / 100)`);
  });

  it('TTC : montant payé, sinon prix x quantité net de remise ; alias de la requête appelante', () => {
    const sql = lineRevenueTtcSql('t', 'i').sql.replace(/\s+/g, ' ');
    expect(sql).toContain(`jsonb_array_elements(i."rawData"->'payments')`);
    expect(sql).toContain(`SUM((p->>'amount')::numeric)`);
    expect(sql).toContain(`i."unitPrice" * i."quantity" - COALESCE(i."reduction", 0)`);
  });

  it('refuse un alias qui ne serait pas un identifiant SQL', () => {
    expect(() => lineRevenueHtSql('t; DROP', 'ti')).toThrow('Alias SQL invalide');
  });
});
