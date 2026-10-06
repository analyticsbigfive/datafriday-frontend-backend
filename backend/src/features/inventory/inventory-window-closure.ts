import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Clôture de fenêtres d'inventaire invité (PIN), partagée par tous les chemins qui en
 * ferment une : Arrêt du bandeau, démarrage de l'autre phase, ouverture des portes,
 * réconciliation post-event, cron de fin de période.
 *
 * Document Bertrand « Pre et Post event Inventory cycle » (2026-10-06) :
 * - le PIN est lié à l'event : il est CONSERVÉ à la clôture, pour qu'une reprise rouvre
 *   l'accès avec le même code (avant, la clôture l'effaçait) ;
 * - un arrêt referme aussi les PDV rouverts un par un : tous les accès PDV de la fenêtre
 *   passent à 'revoked'. L'accès invité ne dépend plus que de cette ligne
 *   (jwt-guest-pin.strategy), d'où l'obligation de passer par ici pour toute clôture.
 *
 * Vit dans le module inventaire : GuestPinAccessModule dépend de ce module, pas l'inverse.
 */
export async function closeInventoryWindows(
  prisma: Pick<PrismaClient, 'inventoryWindow' | 'guestPinAccess'> | Prisma.TransactionClient,
  where: Prisma.InventoryWindowWhereInput,
  data: { closedAt: Date; closedBy: string; pushedToLogisticAt?: Date },
): Promise<{ count: number; windowIds: string[] }> {
  const open = await prisma.inventoryWindow.findMany({
    where: { ...where, status: 'open' },
    select: { id: true },
  });
  if (!open.length) return { count: 0, windowIds: [] };

  // Conditionnel sur status 'open' : deux clôtures simultanées (cron et clic) ne
  // comptent qu'une fois.
  const ids = open.map((w) => w.id);
  const closed = await prisma.inventoryWindow.updateMany({
    where: { id: { in: ids }, status: 'open' },
    data: { status: 'closed', ...data },
  });
  await revokeWindowAccesses(prisma, ids, data.closedBy, data.closedAt);
  return { count: closed.count, windowIds: ids };
}

/** Passe à 'revoked' tous les accès PDV actifs de ces fenêtres. */
export async function revokeWindowAccesses(
  prisma: Pick<PrismaClient, 'guestPinAccess'> | Prisma.TransactionClient,
  windowIds: string[],
  actor: string,
  at: Date = new Date(),
): Promise<number> {
  if (!windowIds.length) return 0;
  const revoked = await prisma.guestPinAccess.updateMany({
    where: { windowId: { in: windowIds }, status: 'active' },
    data: { status: 'revoked', revokedAt: at, revokedBy: actor },
  });
  return revoked.count;
}
