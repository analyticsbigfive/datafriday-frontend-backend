import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { id: true } });
    if (!space) throw new NotFoundException(`Space ${spaceId} not found`);
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
    await this.assertSpace(spaceId, tenantId);

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
            },
          });
        }),
      ),
    );

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

    const { movement } = await this.logisticsService.createMovement(
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
    );

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

    await this.logisticsService.confirmTransfer(task.pickupMovementId, {}, tenantId, userId);

    return this.prisma.logisticTask.update({
      where: { id: task.id },
      data: { status: LogisticTaskStatus.COMPLETED, completedAt: new Date(), completedBy: userId ?? null },
    });
  }
}
