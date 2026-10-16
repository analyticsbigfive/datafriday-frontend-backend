import { HttpException } from '@nestjs/common';

/**
 * Codes d'erreur propres à l'écriture des ventes, en plus de POS_ERROR_CODES (contrat figé par le
 * central : à fusionner dans pos.contracts.ts si le front doit les distinguer).
 */
export const POS_SALE_ERROR_CODES = {
  INVALID_LINE: 'POS_INVALID_LINE', // quantité non entière, nulle, hors bornes, ou négative sur un article à prix positif
  PAYMENT_MISMATCH: 'POS_PAYMENT_MISMATCH', // somme des paiements différente du total du ticket
  INVALID_TIP: 'POS_INVALID_TIP', // pourboire non fini, négatif, ou sur un ticket négatif (déconsigne)
  TICKET_CONFLICT: 'POS_TICKET_CONFLICT', // clientTicketId déjà utilisé par une vente d'un autre point de vente
} as const;

/** Erreur HTTP au format `{ code, message }` attendu par la caisse. */
export const posError = (Exc: new (body: object) => HttpException, code: string, message: string): HttpException =>
  new Exc({ code, message });
