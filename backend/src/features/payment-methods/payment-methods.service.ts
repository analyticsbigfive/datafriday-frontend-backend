import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { POS_DEFAULT_PAYMENT_METHODS, PosPaymentMethodDto } from '../pos/pos.contracts';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/payment-method.dto';

const toDto = (row: PaymentMethod): PosPaymentMethodDto => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  active: row.active,
  sortOrder: row.sortOrder,
  isSystem: row.isSystem,
});

const bySortOrder = (a: PaymentMethod, b: PaymentMethod) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr');

/**
 * Référentiel « Moyens de paiement » d'un tenant (Configuration), sur le modèle de promotion-types.
 * Espèces et Carte sont créés à la demande (`isSystem`) : désactivables, jamais supprimables.
 * Le comportement de la caisse dépend du `kind`, jamais du nom.
 */
@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Moyens actifs du tenant triés (sortOrder), défauts créés à la demande. Interface 4 du PLAN §5 bis. */
  async listActive(tenantId: string): Promise<PosPaymentMethodDto[]> {
    const rows = await this.ensureDefaults(tenantId);
    return rows.filter((r) => r.active).sort(bySortOrder).map(toDto);
  }

  /**
   * Moyens utilisables pour un évènement : `PosEventSetting.paymentMethodIds` vide = tous les actifs.
   * Une sélection qui ne contient plus aucun moyen actif (moyens supprimés ou désactivés depuis)
   * retombe sur tous les actifs, plutôt que de laisser une caisse sans aucun moyen d'encaisser.
   */
  async resolveForEvent(tenantId: string, eventId: string): Promise<PosPaymentMethodDto[]> {
    const [active, setting] = await Promise.all([
      this.listActive(tenantId),
      this.prisma.posEventSetting.findFirst({ where: { tenantId, eventId }, select: { paymentMethodIds: true } }),
    ]);
    const wanted = new Set(setting?.paymentMethodIds ?? []);
    if (!wanted.size) return active;
    const selected = active.filter((m) => wanted.has(m.id));
    return selected.length ? selected : active;
  }

  /** Liste complète (actifs et inactifs) pour l'écran de configuration. */
  async findAll(tenantId: string): Promise<{ data: PosPaymentMethodDto[] }> {
    const rows = await this.ensureDefaults(tenantId);
    return { data: rows.sort(bySortOrder).map(toDto) };
  }

  async findOne(id: string, tenantId: string): Promise<PosPaymentMethodDto> {
    return toDto(await this.requireRow(id, tenantId));
  }

  async create(dto: CreatePaymentMethodDto, tenantId: string): Promise<PosPaymentMethodDto> {
    const name = dto.name.trim();
    const kind = this.cleanKind(dto.kind);
    await this.ensureDefaults(tenantId); // les défauts occupent déjà leur rang avant tout ajout
    await this.assertUniqueName(name, tenantId);
    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(tenantId));
    try {
      const row = await this.prisma.paymentMethod.create({
        data: { tenantId, name, kind, active: dto.active ?? true, sortOrder, isSystem: false },
      });
      return toDto(row);
    } catch (error) {
      throw this.translateDuplicate(error, name);
    }
  }

  async update(id: string, dto: UpdatePaymentMethodDto, tenantId: string): Promise<PosPaymentMethodDto> {
    const row = await this.requireRow(id, tenantId);
    const data: Partial<Pick<PaymentMethod, 'name' | 'kind' | 'active' | 'sortOrder'>> = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
      await this.assertUniqueName(data.name, tenantId, id);
    }
    if (dto.kind !== undefined) {
      const kind = this.cleanKind(dto.kind);
      if (row.isSystem && kind !== row.kind) {
        throw new BadRequestException('La catégorie d\'un moyen de paiement système ne peut pas être modifiée.');
      }
      data.kind = kind;
    }
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (!Object.keys(data).length) return toDto(row);
    try {
      return toDto(await this.prisma.paymentMethod.update({ where: { id }, data }));
    } catch (error) {
      throw this.translateDuplicate(error, data.name ?? row.name);
    }
  }

  async remove(id: string, tenantId: string): Promise<{ deleted: true }> {
    const row = await this.requireRow(id, tenantId);
    if (row.isSystem) {
      throw new ConflictException(`« ${row.name} » est un moyen de paiement système : désactivez-le au lieu de le supprimer.`);
    }
    // Les ventes gardent une copie du nom et du kind : supprimer ne réécrit pas l'historique.
    await this.prisma.paymentMethod.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Crée Espèces et Carte s'il manque un moyen système de cette catégorie. Idempotent et sans
   * doublon en concurrence : `createMany skipDuplicates` s'appuie sur l'unique (tenantId, name)
   * (ON CONFLICT DO NOTHING). Un défaut désactivé ou renommé n'est jamais recréé ni réactivé.
   */
  private async ensureDefaults(tenantId: string): Promise<PaymentMethod[]> {
    const rows = await this.prisma.paymentMethod.findMany({ where: { tenantId } });
    const systemKinds = new Set(rows.filter((r) => r.isSystem).map((r) => r.kind));
    const missing = POS_DEFAULT_PAYMENT_METHODS.filter((d) => !systemKinds.has(d.kind));
    if (!missing.length) return rows;
    await this.prisma.paymentMethod.createMany({
      data: missing.map((d) => ({ tenantId, name: d.name, kind: d.kind, sortOrder: d.sortOrder, isSystem: true, active: true })),
      skipDuplicates: true,
    });
    return this.prisma.paymentMethod.findMany({ where: { tenantId } });
  }

  private async requireRow(id: string, tenantId: string): Promise<PaymentMethod> {
    const row = await this.prisma.paymentMethod.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`PaymentMethod ${id} not found`);
    return row;
  }

  private cleanKind(kind: string): string {
    const clean = (kind ?? '').trim().toLowerCase();
    if (!clean) throw new BadRequestException('La catégorie (kind) du moyen de paiement est obligatoire.');
    return clean;
  }

  private async nextSortOrder(tenantId: string): Promise<number> {
    const last = await this.prisma.paymentMethod.findFirst({ where: { tenantId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    return (last?.sortOrder ?? -1) + 1;
  }

  private async assertUniqueName(name: string, tenantId: string, excludeId?: string): Promise<void> {
    const duplicate = await this.prisma.paymentMethod.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' }, ...(excludeId && { id: { not: excludeId } }) },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException(`A payment method "${name}" already exists`);
  }

  private translateDuplicate(error: unknown, name: string): unknown {
    return (error as { code?: string })?.code === 'P2002' ? new BadRequestException(`A payment method "${name}" already exists`) : error;
  }
}
