import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/** Plafond de documents par espace — l'historique est une liste consultée à
 *  l'œil, pas un journal. Au-delà, l'utilisateur supprime avant d'ajouter. */
const MAX_PLANS_PER_SPACE = 50;
/** Garde-fous de taille. Le `bodyLimit` Fastify est déjà à 5 Mo : ces bornes
 *  protègent le débit (limiteur par tenant) et la lisibilité de la table, pas
 *  le parseur. */
const MAX_RESTOCK_LINES = 5000;
const MAX_PAYLOAD_BYTES = 1_000_000;

/** Champs acceptés en écriture. Le body arrive en `Record<string, unknown>`
 *  (le ValidationPipe global stripperait un DTO strict — cf. controller) : la
 *  whitelist est donc appliquée ICI, explicitement. */
const WRITABLE_SCALARS = [
  'name',
  'objectiveSource',
  'referenceEventId',
  'shoppingMode',
] as const;
const WRITABLE_JSON = [
  'eventsSnapshot',
  'scenarioByEventId',
  'stockAdjustments',
  'stockPackedModes',
  'stockExcluded',
  'restockedRows',
  'stockLines',
  'restockLines',
  'shoppingGroups',
  'recipeCoeffs',
  'lineOverrides',
  'meta',
] as const;

/** Métadonnées de liste : jamais les photos (`restockLines` d'un espace chargé
 *  peut peser des centaines de kilo-octets — les empiler à l'ouverture de la
 *  page annulerait l'intérêt de la fonctionnalité). */
const LIST_SELECT = {
  id: true,
  name: true,
  objectiveSource: true,
  selectedEventIds: true,
  eventsSnapshot: true,
  shoppingMode: true,
  lineCount: true,
  shoppingItemCount: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class RestockPlansService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertSpaceOwnership(spaceId: string, tenantId: string): Promise<void> {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
      select: { id: true },
    });
    if (!space) throw new ForbiddenException(`Space ${spaceId} not found for tenant`);
  }

  private assertPayloadSize(body: Record<string, unknown>): void {
    const lines = body?.restockLines;
    if (Array.isArray(lines) && lines.length > MAX_RESTOCK_LINES) {
      throw new BadRequestException(
        `RESTOCK_PLAN_TOO_LARGE: ${lines.length} lignes (max ${MAX_RESTOCK_LINES}).`,
      );
    }
    const bytes = JSON.stringify(body ?? {}).length;
    if (bytes > MAX_PAYLOAD_BYTES) {
      throw new BadRequestException(
        `RESTOCK_PLAN_TOO_LARGE: ${bytes} octets (max ${MAX_PAYLOAD_BYTES}).`,
      );
    }
  }

  private async assertUnderCap(spaceId: string, tenantId: string): Promise<void> {
    const count = await this.prisma.restockPlan.count({ where: { tenantId, spaceId } });
    if (count >= MAX_PLANS_PER_SPACE) {
      throw new BadRequestException(
        `RESTOCK_PLAN_LIMIT: ${MAX_PLANS_PER_SPACE} plans maximum par espace.`,
      );
    }
  }

  /** Compteurs dénormalisés — recalculés serveur pour qu'ils ne puissent pas
   *  mentir sur le contenu réel de la photo. */
  private counters(body: Record<string, unknown>) {
    const restockLines = Array.isArray(body?.restockLines) ? body.restockLines : [];
    const groups = Array.isArray(body?.shoppingGroups) ? body.shoppingGroups : [];
    const shoppingItemCount = groups.reduce((sum: number, g: any) => {
      return sum + (Array.isArray(g?.items) ? g.items.length : 0);
    }, 0);
    return { lineCount: restockLines.length, shoppingItemCount };
  }

  private pickWritable(body: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    for (const key of WRITABLE_SCALARS) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    for (const key of WRITABLE_JSON) {
      if (body[key] !== undefined) data[key] = body[key] as any;
    }
    if (Array.isArray(body.selectedEventIds)) {
      data.selectedEventIds = body.selectedEventIds.map((id) => String(id));
    }
    return data;
  }

  /** Liste (métadonnées seules), la plus récemment modifiée en tête. */
  async list(spaceId: string, tenantId: string, take = MAX_PLANS_PER_SPACE) {
    return this.prisma.restockPlan.findMany({
      where: { tenantId, spaceId },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(Number(take) || MAX_PLANS_PER_SPACE, 1), MAX_PLANS_PER_SPACE),
      select: LIST_SELECT,
    });
  }

  /** Document complet, photo comprise. */
  async findById(id: string, tenantId: string) {
    const plan = await this.prisma.restockPlan.findFirst({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException(`RestockPlan ${id} introuvable`);
    return plan;
  }

  async create(
    spaceId: string,
    tenantId: string,
    body: Record<string, unknown>,
    userId?: string,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Le corps doit être un objet JSON (plan de réarmement).');
    }
    const name = String(body.name ?? '').trim();
    if (!name) throw new BadRequestException('Le plan doit porter un nom.');
    this.assertPayloadSize(body);
    await this.assertSpaceOwnership(spaceId, tenantId);
    await this.assertUnderCap(spaceId, tenantId);
    return this.prisma.restockPlan.create({
      data: {
        tenantId,
        spaceId,
        ...(this.pickWritable(body) as any),
        name,
        ...this.counters(body),
        createdBy: userId ?? null,
      },
    });
  }

  async patch(id: string, tenantId: string, body: Record<string, unknown>) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Le corps doit être un objet JSON.');
    }
    this.assertPayloadSize(body);
    await this.findById(id, tenantId); // 404 hors tenant, jamais de fuite
    const data = this.pickWritable(body);
    // Les compteurs ne suivent que si la photo change dans le même appel.
    if (body.restockLines !== undefined || body.shoppingGroups !== undefined) {
      Object.assign(data, this.counters(body));
    }
    return this.prisma.restockPlan.update({ where: { id }, data: data as any });
  }

  /** Duplication côté serveur : évite de re-téléverser la photo entière juste
   *  pour en faire une copie. */
  async duplicate(id: string, tenantId: string, name?: string, userId?: string) {
    const source = await this.findById(id, tenantId);
    await this.assertUnderCap(source.spaceId, tenantId);
    const { id: _id, createdAt: _c, updatedAt: _u, createdBy: _b, ...rest } = source as any;
    return this.prisma.restockPlan.create({
      data: {
        ...rest,
        name: String(name ?? `${source.name} (copie)`).trim() || `${source.name} (copie)`,
        createdBy: userId ?? null,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findById(id, tenantId);
    await this.prisma.restockPlan.delete({ where: { id } });
  }
}
