/**
 * ADR-0006 : une ligne de stock trouvée par NOM (`uniq_stock_level` = PdV + itemKey) n'est adoptée
 * que si elle n'appartient pas à un autre article. Deux cas d'adoption :
 *  - ligne encore « libre » (itemRefId null, legacy à guérir) ou déjà rattachée à cette identité ;
 *  - variante de prix (règle validée par Ulrich le 2026-10-06) : deux MarketPrice de même nom sont
 *    le MÊME produit, à un fournisseur ou un tarif près. Nantes-Montpellier F, 2026-10-03 :
 *    « Coca-Cola Cherry - CAN 33CL » existe sous 3 MarketPrice ; le stock était rattaché à l'ancien,
 *    l'inventaire comptait sous le récent. Traités comme homonymes, ils déclenchaient la création
 *    d'une seconde ligne de même nom, refusée par `uniq_stock_level` : toute la mise à jour
 *    Logistic était annulée (28 lignes sur 76 en conflit, aucune poussée).
 *
 * Les homonymes ENTRE tables (un MenuItem et un MarketPrice de même nom) restent distincts.
 */
export function canAdoptStockLevelByName(
  row: { itemKind?: string | null; itemRefId?: string | null },
  identity: { itemKind: string; itemRefId: string } | null | undefined,
): boolean {
  if (!identity || !row.itemRefId) return true;
  if (row.itemRefId === identity.itemRefId) return true;
  return row.itemKind === 'marketPrice' && identity.itemKind === 'marketPrice';
}
