import { InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Montant d'une ligne de vente, UNE seule formule pour tous les calculs de CA (BUG-352-01) :
 * paiements Weezevent réellement encaissés (`rawData->'payments'`, en centimes TTC) quand la clé
 * existe, sinon prix × quantité net de remise. Une ligne « menu/formule » envoyée au prix catalogue
 * avec `payments: []` (ses composants portent les paiements) vaut donc 0 : la compter au prix
 * catalogue doublait l'argent du menu (mesuré en production le 2026-10-09 : 5 861 lignes, 74 k€ HT
 * sur 30 jours). Ne pas utiliser pour un PRIX de référence (SalesPriceAgg) : le prix d'un menu
 * est bien son prix catalogue.
 *
 * `tx` et `item` : alias SQL de la transaction et de la ligne dans la requête appelante.
 */
function paidOr(tx: string, item: string, paid: Prisma.Sql, fallback: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
  CASE WHEN ${Prisma.raw(tx)}."provider" = 'WEEZEVENT' AND ${Prisma.raw(item)}."rawData" ? 'payments' THEN
    COALESCE((
      SELECT SUM(${paid})
      FROM jsonb_array_elements(${Prisma.raw(item)}."rawData"->'payments') AS p
    ), 0) / 100
  ELSE
    ${fallback}
  END
`;
}

const ALIAS = /^[a-z_][a-z0-9_]*$/i;

function assertAliases(tx: string, item: string): void {
  if (!ALIAS.test(tx) || !ALIAS.test(item)) throw new InternalServerErrorException(`Alias SQL invalide : ${tx}, ${item}`);
}

/** CA HT d'une ligne. */
export function lineRevenueHtSql(tx = 't', item = 'ti'): Prisma.Sql {
  assertAliases(tx, item);
  const i = Prisma.raw(item);
  return paidOr(
    tx,
    item,
    Prisma.sql`(p->>'amount')::numeric - (p->>'amount_vat')::numeric`,
    Prisma.sql`(${i}."unitPrice" * ${i}."quantity" - COALESCE(${i}."reduction", 0)) / (1 + ${i}."vat" / 100)`,
  );
}

/** Montant TTC d'une ligne. */
export function lineRevenueTtcSql(tx = 't', item = 'ti'): Prisma.Sql {
  assertAliases(tx, item);
  const i = Prisma.raw(item);
  return paidOr(
    tx,
    item,
    Prisma.sql`(p->>'amount')::numeric`,
    Prisma.sql`${i}."unitPrice" * ${i}."quantity" - COALESCE(${i}."reduction", 0)`,
  );
}
