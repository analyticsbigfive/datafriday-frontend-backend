import { Prisma } from '@prisma/client';
import { PosItemRawData, PosPaymentLine, PosSaleRow, PosTransactionMetadata } from '../pos.contracts';
import { lineTotal, round2, tipTotalOf, vatOf } from './pos-sale-rules';

/** Paiements d'une vente, avec pourboire 0 pour les ventes écrites avant les pourboires. */
export function paymentsOf(meta: Partial<PosTransactionMetadata>): PosPaymentLine[] {
  return (meta.payments ?? []).map((p) => ({ ...p, tipTtc: p.tipTtc ?? 0 }));
}

/** Transaction POS avec ses lignes, telle que lue en base pour l'historique et les réponses de vente. */
export interface PosSaleRecord {
  id: string;
  amount: Prisma.Decimal | number;
  transactionDate: Date;
  deletedAt: Date | null;
  locationName: string | null;
  metadata: Prisma.JsonValue;
  items: Array<{
    productName: string | null;
    quantity: number;
    unitPrice: Prisma.Decimal | number;
    vat: Prisma.Decimal | number;
    rawData: Prisma.JsonValue;
  }>;
}

/** Select Prisma commun aux lectures de vente (une seule forme, mappée par toSaleRow). */
export const POS_SALE_SELECT = {
  id: true,
  amount: true,
  transactionDate: true,
  deletedAt: true,
  locationName: true,
  metadata: true,
  items: { select: { productName: true, quantity: true, unitPrice: true, vat: true, rawData: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.SalesTransactionSelect;

/** Vente POS -> ligne d'historique du contrat. Les montants viennent des lignes figées en base. */
export function toSaleRow(record: PosSaleRecord): PosSaleRow {
  const meta = (record.metadata ?? {}) as Partial<PosTransactionMetadata>;
  const payments = paymentsOf(meta);
  const lines = record.items.map((item) => {
    const raw = (item.rawData ?? {}) as Partial<PosItemRawData>;
    const unitPrice = Number(item.unitPrice);
    return {
      menuItemId: raw.menuItemId ?? '',
      name: item.productName ?? '',
      quantity: item.quantity,
      unitPrice,
      totalTtc: lineTotal(unitPrice, item.quantity),
      vatRate: Number(item.vat),
    };
  });
  return {
    id: record.id,
    ticketNumber: meta.ticketNumber ?? 0,
    createdAt: record.transactionDate.toISOString(),
    elementId: meta.elementId ?? '',
    pdvName: record.locationName ?? '',
    vendorName: meta.vendorName ?? '',
    payments,
    tipTotal: tipTotalOf(payments),
    totalTtc: round2(Number(record.amount)),
    vatTotal: round2(lines.reduce((sum, l) => sum + vatOf(l.totalTtc, l.vatRate), 0)),
    cancelled: record.deletedAt != null,
    syncStatus: 'synced',
    lines,
  };
}
