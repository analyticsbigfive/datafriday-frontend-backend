import { Prisma } from '@prisma/client';

/**
 * Numéro de ticket lisible, par PdV et par évènement (1, 2, 3...), attribué DANS la transaction
 * d'écriture de la vente.
 *
 * Choix : séquence en base (compte + verrou), pas un compteur Redis INCR.
 *  - Durable : un flush ou une éviction Redis ne remet jamais le compteur à zéro (doublons de numéros,
 *    tickets introuvables à la clôture). Aucune dépendance à Redis pour encaisser.
 *  - Atomique : un verrou advisory de TRANSACTION (jamais de session, pooleur 6543) sur
 *    (PdV, SalesEvent) sérialise les ventes d'une même caisse ; le numéro = nombre de ventes déjà
 *    écrites + 1. Les ventes annulées gardent leur ligne (deletedAt), leur numéro n'est donc jamais réattribué.
 *  - Aucun schéma ajouté (pas de table de compteur). La requête de comptage est couverte par
 *    l'index (tenantId, locationId, status, eventId) : lecture d'index seule, bornée à une caisse.
 * Coût : les ventes d'un même PdV s'écrivent l'une après l'autre (quelques ms), celles des autres PdV ne s'attendent pas.
 */
export async function reserveTicketNumber(
  tx: Pick<Prisma.TransactionClient, '$executeRaw' | 'salesTransaction'>,
  scope: { tenantId: string; locationId: string; salesEventId: string },
): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-ticket:${scope.locationId}:${scope.salesEventId}`}))`;
  const written = await tx.salesTransaction.count({
    where: { tenantId: scope.tenantId, locationId: scope.locationId, status: 'V', eventId: scope.salesEventId },
  });
  return written + 1;
}
