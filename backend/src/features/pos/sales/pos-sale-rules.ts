import { BadRequestException } from '@nestjs/common';
import { PosCreateSaleBody, PosPaymentLine, PosPaymentMethodDto, POS_ERROR_CODES } from '../pos.contracts';
import { POS_SALE_ERROR_CODES, posError } from './pos-sale-errors';

/** Bornes de protection d'un ticket (une erreur de saisie ou un client malveillant ne doit pas écrire 10 000 lignes). */
export const POS_MAX_LINES = 100;
export const POS_MAX_QUANTITY = 999;
/** Tolérance d'arrondi entre la somme des paiements et le total (un demi-centime). */
export const POS_PAYMENT_TOLERANCE = 0.005;

export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Montant TTC d'une ligne. */
export const lineTotal = (unitPrice: number, quantity: number): number => round2(unitPrice * quantity);

/** TVA contenue dans un montant TTC. */
export const vatOf = (totalTtc: number, vatRate: number): number =>
  vatRate > 0 ? round2(totalTtc - totalTtc / (1 + vatRate / 100)) : 0;

/**
 * Forme du ticket : non vide, au plus POS_MAX_LINES lignes, quantités ENTIÈRES de 1 à POS_MAX_QUANTITY.
 *
 * Règle des lignes négatives (déconsigne) : une ligne n'est négative QUE parce que le prix du menu
 * item est négatif dans le catalogue (ex. « Déconsigne Ecocup » à -1 €, vendu en quantité positive,
 * comme l'export Digifood). Une quantité négative est donc toujours refusée : sur un article à prix
 * positif elle ouvrirait un remboursement libre, sur un article à prix négatif elle donnerait un CA
 * fictif (double négation). Un ticket peut être négatif au total (client qui ne fait que rendre un
 * gobelet) : le paiement porte alors un montant négatif, validé par assertPayments.
 */
export function assertTicketShape(lines: PosCreateSaleBody['lines']): void {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw posError(BadRequestException, POS_ERROR_CODES.EMPTY_TICKET, 'Le ticket est vide.');
  }
  if (lines.length > POS_MAX_LINES) {
    throw posError(BadRequestException, POS_SALE_ERROR_CODES.INVALID_LINE, `Un ticket ne peut pas dépasser ${POS_MAX_LINES} lignes.`);
  }
  for (const line of lines) {
    const q = line.quantity;
    if (!Number.isInteger(q) || q < 1 || q > POS_MAX_QUANTITY) {
      throw posError(
        BadRequestException,
        POS_SALE_ERROR_CODES.INVALID_LINE,
        `La quantité doit être un entier de 1 à ${POS_MAX_QUANTITY} (une déconsigne se saisit avec l'article de déconsigne, pas avec une quantité négative).`,
      );
    }
  }
}

export type ValidatedPayment = PosPaymentLine;

/** Total des pourboires d'une liste de paiements (arrondi au centime). */
export const tipTotalOf = (payments: Array<{ tipTtc?: number }>): number => round2(payments.reduce((sum, p) => sum + (p.tipTtc ?? 0), 0));

/**
 * Paiements : chaque moyen doit être actif pour l'évènement (référentiel PaymentMethod résolu par
 * PaymentMethodsService.resolveForEvent), montants finis, somme = total du ticket à un demi-centime
 * près. Renvoie la copie figée (nom + kind) écrite dans la vente (principe 1 bis, n°4).
 *
 * Pourboire (`tipTtc`, optionnel, défaut 0) : fini, >= 0, arrondi au centime ; refusé avec TIPS_DISABLED
 * si l'évènement ne l'accepte pas, et refusé sur un ticket négatif (déconsigne). Il n'entre PAS dans la
 * somme comparée au total : le pourboire est hors chiffre d'affaires et hors TVA.
 */
export function assertPayments(
  payments: PosCreateSaleBody['payments'],
  allowed: PosPaymentMethodDto[],
  total: number,
  options: { tipsEnabled: boolean },
): ValidatedPayment[] {
  if (!Array.isArray(payments) || payments.length === 0) {
    throw posError(BadRequestException, POS_SALE_ERROR_CODES.PAYMENT_MISMATCH, 'Aucun paiement renseigné.');
  }
  const byId = new Map(allowed.map((m) => [m.id, m]));
  const out: ValidatedPayment[] = [];
  for (const p of payments) {
    const method = byId.get(p.paymentMethodId);
    if (!method) {
      throw posError(BadRequestException, POS_ERROR_CODES.PAYMENT_METHOD_DISABLED, "Ce moyen de paiement n'est pas disponible pour cet évènement.");
    }
    if (!Number.isFinite(p.amountTtc)) {
      throw posError(BadRequestException, POS_SALE_ERROR_CODES.PAYMENT_MISMATCH, 'Montant de paiement invalide.');
    }
    const tip = p.tipTtc ?? 0;
    if (!Number.isFinite(tip) || tip < 0) {
      throw posError(BadRequestException, POS_SALE_ERROR_CODES.INVALID_TIP, 'Pourboire invalide.');
    }
    const tipTtc = round2(tip);
    if (tipTtc > 0 && !options.tipsEnabled) {
      throw posError(BadRequestException, POS_ERROR_CODES.TIPS_DISABLED, "Les pourboires ne sont pas acceptés pour cet évènement.");
    }
    if (tipTtc > 0 && total < 0) {
      throw posError(BadRequestException, POS_SALE_ERROR_CODES.INVALID_TIP, "Une déconsigne ne porte pas de pourboire.");
    }
    out.push({ paymentMethodId: method.id, name: method.name, kind: method.kind, amountTtc: round2(p.amountTtc), tipTtc });
  }
  const paid = round2(out.reduce((sum, p) => sum + p.amountTtc, 0));
  if (Math.abs(paid - total) > POS_PAYMENT_TOLERANCE) {
    throw posError(BadRequestException, POS_SALE_ERROR_CODES.PAYMENT_MISMATCH, 'La somme des paiements ne correspond pas au total du ticket.');
  }
  return out;
}
