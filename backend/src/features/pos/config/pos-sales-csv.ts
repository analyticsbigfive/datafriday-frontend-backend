import type { PosSaleRow } from '../pos.contracts';

/** Séparateur point-virgule (Excel FR), BOM UTF-8 en tête pour les accents. */
export const CSV_SEPARATOR = ';';
export const CSV_BOM = '﻿';

// Pourboire en colonne séparée : hors CA et hors TVA, jamais inclus dans « Total TTC ».
const HEADER = ['Ticket', 'Date', 'Point de vente', 'Vendeur', 'Paiement', 'Total TTC', 'TVA', 'Pourboire', 'Statut', 'Lignes'];

/** Neutralise l'injection de formule tableur et protège les séparateurs, guillemets et retours ligne. */
export function csvCell(value: string | number): string {
  let text = String(value ?? '');
  if (/^[=+@\t\r]/.test(text) || /^-(?![\d.,]+$)/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const money = (n: number) => n.toFixed(2).replace('.', ',');

export function buildSalesCsv(rows: PosSaleRow[]): string {
  const lines = [HEADER.map(csvCell).join(CSV_SEPARATOR)];
  for (const row of rows) {
    lines.push(
      [
        row.ticketNumber,
        row.createdAt,
        row.pdvName,
        row.vendorName,
        row.payments.map((p) => `${p.name} ${money(p.amountTtc)}`).join(' + '),
        money(row.totalTtc),
        money(row.vatTotal),
        money(row.tipTotal ?? 0),
        row.cancelled ? 'Annulé' : 'Valide',
        row.lines.map((l) => `${l.quantity} x ${l.name}`).join(' | '),
      ]
        .map(csvCell)
        .join(CSV_SEPARATOR),
    );
  }
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}
