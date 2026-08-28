import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LogisticTaskPriority, LogisticTaskStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { LogisticsService } from '../logistics/logistics.service';
import { StockItemKind } from '../logistics/dto/logistics.dto';
import { CreateLogisticTaskBatchDto } from './dto/logistic-tasks.dto';

/** Miroir de SHOP_TYPES (logistics.service.ts) : sert uniquement à choisir TRANSFER_SHOP
 * vs TRANSFER_STORAGE pour la contrepartie, même convention que LogisticMovementDialog. */
const SHOP_TYPES = ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'];

const ONGOING_STATUSES: LogisticTaskStatus[] = [LogisticTaskStatus.PENDING, LogisticTaskStatus.PICKED_UP];

/**
 * Orchestration staff/priorité PAR-DESSUS le ledger StockMovement (LogisticsService) :
 * un LogisticTask ne bouge jamais le stock lui-même — pickup()/drop() délèguent à
 * createMovement()/confirmTransfer(), déjà responsables de la casse de pack, du
 * plafond de stock disponible et des pertes de transfert (StockTransferLoss).
 */
@Injectable()
export class LogisticTasksService {
  private readonly logger = new Logger(LogisticTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logisticsService: LogisticsService,
  ) {}

  private async assertSpace(spaceId: string, tenantId: string) {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { id: true, name: true } });
    if (!space) throw new NotFoundException(`Space ${spaceId} not found`);
    return space;
  }

  /** Résout le nom + type des SpaceElement référencés, pour enrichir les réponses. */
  private async resolveElements(ids: string[]) {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (!uniqueIds.length) return new Map<string, { name: string; type: string }>();
    const rows = await this.prisma.spaceElement.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true, type: true },
    });
    return new Map(rows.map((r) => [r.id, { name: r.name, type: r.type }]));
  }

  private async resolveUsers(ids: string[]) {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (!uniqueIds.length) return new Map<string, { fullName: string | null; firstName: string; lastName: string }>();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, fullName: true, firstName: true, lastName: true },
    });
    return new Map(rows.map((r) => [r.id, { fullName: r.fullName, firstName: r.firstName, lastName: r.lastName }]));
  }

  // ─── POST /spaces/:spaceId/logistic-tasks/batch ──────────────────────────────

  async createBatch(spaceId: string, dto: CreateLogisticTaskBatchDto, tenantId: string, userId?: string) {
    if (!dto.tasks?.length) {
      throw new BadRequestException('Aucune tâche à créer');
    }
    const space = await this.assertSpace(spaceId, tenantId);
    // Un batchId par appel : sert uniquement à détecter la clôture complète du lot
    // (tous ses statuts passés à COMPLETED) pour notifier son créateur, cf. drop().
    const batchId = randomUUID();

    const created = await this.prisma.$transaction((tx) =>
      Promise.all(
        dto.tasks.map((line) => {
          if ((line.packed ?? 0) === 0 && (line.loose ?? 0) === 0) {
            throw new BadRequestException('Quantité nulle : packed ou loose doit être > 0');
          }
          if (line.sourceElementId === line.destinationElementId) {
            throw new BadRequestException('Origine et destination doivent être différentes');
          }
          return tx.logisticTask.create({
            data: {
              tenantId,
              spaceId,
              itemKey: line.itemKey,
              itemKind: line.itemKind ?? null,
              itemRefId: line.itemRefId ?? null,
              menuItemId: line.menuItemId ?? null,
              sourceElementId: line.sourceElementId,
              destinationElementId: line.destinationElementId,
              packedQty: line.packed,
              looseQty: line.loose,
              assignedToUserId: line.assignedToUserId,
              priority: line.priority as LogisticTaskPriority,
              createdBy: userId ?? null,
              batchId,
            },
          });
        }),
      ),
    );

    // Mockup "Déclenchement d'un restockage dans Logistique" (08/2026) : le logisticien
    // assigné doit être notifié. Une notification PAR STAFF pour tout le lot (pas une par
    // tâche, un transfert crée souvent plusieurs tâches d'un coup pour la même personne).
    // Best-effort : une notification ratée ne doit jamais faire échouer la création des
    // tâches, déjà commitées à ce stade.
    try {
      const byStaff = new Map<string, number>();
      for (const task of created) byStaff.set(task.assignedToUserId, (byStaff.get(task.assignedToUserId) ?? 0) + 1);
      await this.prisma.notification.createMany({
        data: [...byStaff.entries()].map(([assignedToUserId, count]) => ({
          tenantId,
          userId: assignedToUserId,
          type: 'logistic_task_assigned',
          title: 'Nouvelle tâche de restockage',
          message: count > 1 ? `${count} tâches à traiter pour ${space.name}` : `1 tâche à traiter pour ${space.name}`,
          meta: { spaceId, taskIds: created.filter((t) => t.assignedToUserId === assignedToUserId).map((t) => t.id) },
          link: `/spaces/${spaceId}/logistic`,
        })),
      });
    } catch (e) {
      this.logger.error(`Notification logistic_task_assigned échouée pour le lot ${spaceId} : ${(e as Error)?.message}`);
    }

    this.logger.log(`POST /logistic-tasks/${spaceId}/batch → ${created.length} tâche(s) créée(s)`);
    return { tasks: created };
  }

  // ─── GET /spaces/:spaceId/logistic-tasks ──────────────────────────────────────

  /** Tâches de l'espace, enrichies des noms (item déjà porté par itemKey, éléments, staff). */
  async listBySpace(spaceId: string, tenantId: string, assignedToUserId?: string) {
    await this.assertSpace(spaceId, tenantId);
    const rows = await this.prisma.logisticTask.findMany({
      where: { tenantId, spaceId, ...(assignedToUserId ? { assignedToUserId } : {}) },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
    const elementsById = await this.resolveElements(rows.flatMap((r) => [r.sourceElementId, r.destinationElementId]));
    const usersById = await this.resolveUsers(rows.map((r) => r.assignedToUserId));
    const formatUserName = (id: string) => {
      const u = usersById.get(id);
      return u?.fullName || [u?.firstName, u?.lastName].filter(Boolean).join(' ') || id;
    };

    return rows.map((r) => ({
      id: r.id,
      itemKey: r.itemKey,
      itemKind: r.itemKind,
      itemRefId: r.itemRefId,
      menuItemId: r.menuItemId,
      sourceElementId: r.sourceElementId,
      sourceElementName: elementsById.get(r.sourceElementId)?.name ?? r.sourceElementId,
      destinationElementId: r.destinationElementId,
      destinationElementName: elementsById.get(r.destinationElementId)?.name ?? r.destinationElementId,
      packedQty: r.packedQty,
      looseQty: r.looseQty,
      assignedToUserId: r.assignedToUserId,
      assignedToName: formatUserName(r.assignedToUserId),
      priority: r.priority,
      status: r.status,
      pickedUpAt: r.pickedUpAt,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
    }));
  }

  // ─── GET /spaces/:spaceId/logistic-tasks/assignable-staff ────────────────────

  /**
   * Utilisateurs assignables à une tâche pour cet espace : accès à l'espace (allSpacesAccess
   * ou UserSpaceAccess explicite, même règle que SpaceAccessService) ET la permission
   * `front.fb.logistic` (ou ADMIN, qui l'a toujours — cf. PermissionsGuard). Enrichi du
   * nombre de tâches en cours (PENDING/PICKED_UP) pour le tri croissant du drawer Restocker.
   */
  async listAssignableStaff(spaceId: string, tenantId: string) {
    await this.assertSpace(spaceId, tenantId);
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        AND: [
          { OR: [{ isSuperAdmin: true }, { allSpacesAccess: true }, { spaceAccess: { some: { spaceId } } }] },
          {
            OR: [
              { roleRef: { systemKey: 'ADMIN' } },
              { roleRef: { permissions: { some: { permission: { code: 'front.fb.logistic' } } } } },
              { userTenants: { some: { tenantId, isOwner: true } } },
            ],
          },
        ],
      },
      select: { id: true, fullName: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    });
    if (!users.length) return [];

    const counts = await this.prisma.logisticTask.groupBy({
      by: ['assignedToUserId'],
      where: { tenantId, spaceId, status: { in: ONGOING_STATUSES }, assignedToUserId: { in: users.map((u) => u.id) } },
      _count: { _all: true },
    });
    const countByUser = new Map(counts.map((c) => [c.assignedToUserId, c._count._all]));

    return users
      .map((u) => ({
        id: u.id,
        name: u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.id,
        ongoingTaskCount: countByUser.get(u.id) ?? 0,
      }))
      .sort((a, b) => a.ongoingTaskCount - b.ongoingTaskCount);
  }

  // ─── PATCH /logistic-tasks/:id/pickup ─────────────────────────────────────────

  private async getTaskOrThrow(id: string, tenantId: string) {
    const task = await this.prisma.logisticTask.findFirst({ where: { id, tenantId } });
    if (!task) throw new NotFoundException(`Tâche ${id} not found`);
    return task;
  }

  /** Case "Récupérer" cochée : décrémente le stock source via LogisticsService.createMovement. */
  async pickup(id: string, tenantId: string, userId?: string) {
    const task = await this.getTaskOrThrow(id, tenantId);
    if (task.status !== LogisticTaskStatus.PENDING) {
      throw new BadRequestException(`Tâche ${id} déjà récupérée ou terminée`);
    }

    const destination = await this.prisma.spaceElement.findUnique({
      where: { id: task.destinationElementId },
      select: { type: true },
    });
    if (!destination) throw new NotFoundException(`Element ${task.destinationElementId} not found`);
    const reason = SHOP_TYPES.includes(destination.type) ? 'TRANSFER_SHOP' : 'TRANSFER_STORAGE';

    let movement: { id: string };
    try {
      ({ movement } = await this.logisticsService.createMovement(
        {
          spaceId: task.spaceId,
          elementId: task.sourceElementId,
          itemKey: task.itemKey,
          itemKind: (task.itemKind as StockItemKind | null) ?? undefined,
          itemRefId: task.itemRefId ?? undefined,
          direction: 'remove',
          packed: task.packedQty,
          loose: task.looseQty,
          reason: reason as any,
          counterpartyElementId: task.destinationElementId,
          menuItemId: task.menuItemId ?? undefined,
        },
        tenantId,
        userId,
      ));
    } catch (e) {
      await this.notifyTaskFailure(task, tenantId, 'pickup', e as Error);
      throw e;
    }

    return this.prisma.logisticTask.update({
      where: { id: task.id },
      data: {
        status: LogisticTaskStatus.PICKED_UP,
        pickupMovementId: movement.id,
        pickedUpAt: new Date(),
        pickedUpBy: userId ?? null,
      },
    });
  }

  // ─── PATCH /logistic-tasks/:id/drop ───────────────────────────────────────────

  /** Case "Déposer" cochée : crédite le stock destination via LogisticsService.confirmTransfer. */
  async drop(id: string, tenantId: string, userId?: string) {
    const task = await this.getTaskOrThrow(id, tenantId);
    if (task.status !== LogisticTaskStatus.PICKED_UP) {
      throw new BadRequestException(`Tâche ${id} doit être récupérée avant d'être déposée`);
    }
    if (!task.pickupMovementId) {
      throw new BadRequestException(`Tâche ${id} sans mouvement de récupération associé`);
    }

    try {
      await this.logisticsService.confirmTransfer(task.pickupMovementId, {}, tenantId, userId);
    } catch (e) {
      await this.notifyTaskFailure(task, tenantId, 'drop', e as Error);
      throw e;
    }

    const updated = await this.prisma.logisticTask.update({
      where: { id: task.id },
      data: { status: LogisticTaskStatus.COMPLETED, completedAt: new Date(), completedBy: userId ?? null },
    });

    await this.notifyBatchCompletedIfDone(updated, tenantId);

    return updated;
  }

  // ─── Notifications best-effort (échec pickup/drop, clôture de lot) ────────────

  /** Alerte le créateur de la tâche (pas l'assigné, déjà au courant via l'erreur
   *  affichée dans son propre écran) qu'un pickup/drop a échoué, sinon un souci de
   *  stock reste invisible pour qui a planifié le restockage. Best-effort : ne doit
   *  jamais faire échouer pickup()/drop() elles-mêmes. */
  private async notifyTaskFailure(
    task: { id: string; createdBy: string | null; itemKey: string; spaceId: string },
    tenantId: string,
    action: 'pickup' | 'drop',
    error: Error,
  ) {
    if (!task.createdBy) return;
    try {
      await this.prisma.notification.create({
        data: {
          tenantId,
          userId: task.createdBy,
          type: 'logistic_task_failed',
          title: action === 'pickup' ? 'Récupération échouée' : 'Dépôt échoué',
          message: `${task.itemKey} : ${error?.message || 'erreur inconnue'}`,
          meta: { spaceId: task.spaceId, taskId: task.id },
          link: `/spaces/${task.spaceId}/logistic`,
        },
      });
    } catch (e) {
      this.logger.error(`Notification logistic_task_failed échouée pour ${task.id} : ${(e as Error)?.message}`);
    }
  }

  /** Toutes les tâches du même lot sont-elles COMPLETED ? Si oui, notifie le créateur
   *  du lot (boucle refermée : il sait que son restockage est entièrement livré). */
  private async notifyBatchCompletedIfDone(task: { batchId: string | null; createdBy: string | null; spaceId: string }, tenantId: string) {
    if (!task.batchId || !task.createdBy) return;
    try {
      const [space, remaining, total] = await Promise.all([
        this.prisma.space.findFirst({ where: { id: task.spaceId, tenantId }, select: { name: true } }),
        this.prisma.logisticTask.count({ where: { tenantId, batchId: task.batchId, status: { not: LogisticTaskStatus.COMPLETED } } }),
        this.prisma.logisticTask.count({ where: { tenantId, batchId: task.batchId } }),
      ]);
      if (remaining > 0) return;
      await this.prisma.notification.create({
        data: {
          tenantId,
          userId: task.createdBy,
          type: 'logistic_batch_completed',
          title: 'Restockage terminé',
          message: `${total} tâche(s) livrée(s) pour ${space?.name ?? 'ton espace'}`,
          meta: { spaceId: task.spaceId, batchId: task.batchId },
          link: `/spaces/${task.spaceId}/logistic`,
        },
      });
    } catch (e) {
      this.logger.error(`Notification logistic_batch_completed échouée pour le lot ${task.batchId} : ${(e as Error)?.message}`);
    }
  }

  // ─── PATCH /logistic-tasks/:id/undo-pickup ─────────────────────────────────────

  /** Case "Récupérer" décochée par erreur : annule le mouvement (pas encore confirmé,
   *  cf. LogisticsService.reverseMovement), la tâche redevient PENDING. Rien à annuler
   *  côté "Déposer" (COMPLETED) : le mouvement est alors déjà confirmé, une contrepartie
   *  a déjà été créditée, hors scope de ce garde-fou volontairement borné. */
  async undoPickup(id: string, tenantId: string) {
    const task = await this.getTaskOrThrow(id, tenantId);
    if (task.status !== LogisticTaskStatus.PICKED_UP) {
      throw new BadRequestException(`Tâche ${id} n'est pas au statut Récupérée, rien à annuler`);
    }
    if (!task.pickupMovementId) {
      throw new BadRequestException(`Tâche ${id} sans mouvement de récupération associé`);
    }

    await this.logisticsService.reverseMovement(task.pickupMovementId, tenantId);

    return this.prisma.logisticTask.update({
      where: { id: task.id },
      data: { status: LogisticTaskStatus.PENDING, pickupMovementId: null, pickedUpAt: null, pickedUpBy: null },
    });
  }
}
