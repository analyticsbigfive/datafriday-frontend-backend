import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { HrRoleService } from './hr-role.service';

/**
 * Règles de mutualisation des postes RH.
 */
@Injectable()
export class HrSinkingRuleService {
  constructor(
    private prisma: PrismaService,
    private readonly hrRoleService: HrRoleService,
  ) {}

  // ── Sinking rules (STF-2 : dotation conditionnelle par rôle × sous-type FNB) ─

  private mapSinkingRule(r: any) {
    return {
      id: r.id,
      roleId: r.roleId,
      fnbCategory: r.fnbCategory,
      conditionAttribute: r.conditionAttribute,
      conditionMinValue: r.conditionMinValue,
      mandatoryQty: r.mandatoryQty,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async findAllSinkingRules(tenantId: string, filter: { roleId?: string } = {}) {
    const rows = await this.prisma.hrSinkingRule.findMany({
      where: { tenantId, ...(filter.roleId && { roleId: filter.roleId }) },
      orderBy: { createdAt: 'asc' },
    });
    return { data: rows.map((r) => this.mapSinkingRule(r)) };
  }

  private async assertValidSinkingRule(input: any, tenantId: string, existing?: any) {
    // CFG-2 (généralisé 2026-07-31) : le sous-type valide dépend du département du RÔLE visé par
    // la règle, pas figé sur `shop` — même principe que fnbCategories sur HrRole.
    const roleId = input.roleId ?? existing?.roleId;
    const role = await this.prisma.hrRole.findFirst({ where: { id: roleId, tenantId } });
    if (!role) throw new BadRequestException(`Rôle ${roleId} introuvable`);
    const departmentRow = await this.prisma.department.findFirst({
      where: { OR: [{ code: role.department }, { id: role.department }] },
    });
    if (!departmentRow) {
      throw new BadRequestException(`department invalide pour le rôle ${roleId} : ${role.department}`);
    }
    const [fnbCategory] = await this.hrRoleService.resolveFnbCategories(
      [input.fnbCategory ?? existing?.fnbCategory],
      departmentRow.id,
    );
    const conditionAttribute =
      input.conditionAttribute !== undefined ? (input.conditionAttribute || null) : (existing?.conditionAttribute ?? null);
    const conditionMinValue =
      input.conditionMinValue !== undefined ? input.conditionMinValue : (existing?.conditionMinValue ?? null);
    if (conditionAttribute && (conditionMinValue === null || conditionMinValue === undefined)) {
      throw new BadRequestException('conditionMinValue est requis quand conditionAttribute est renseigné.');
    }
    const mandatoryQty = input.mandatoryQty !== undefined ? Number(input.mandatoryQty) : (existing?.mandatoryQty ?? 1);
    if (!Number.isFinite(mandatoryQty) || mandatoryQty < 1) {
      throw new BadRequestException('mandatoryQty doit être un entier ≥ 1.');
    }
    return { fnbCategory, conditionAttribute, conditionMinValue: conditionAttribute ? conditionMinValue : null, mandatoryQty };
  }

  async createSinkingRule(input: any, tenantId: string) {
    const role = await this.prisma.hrRole.findFirst({ where: { id: input.roleId, tenantId } });
    if (!role) throw new BadRequestException(`Rôle ${input.roleId} introuvable`);
    const n = await this.assertValidSinkingRule(input, tenantId);
    try {
      const row = await this.prisma.hrSinkingRule.create({
        data: {
          tenantId,
          roleId: input.roleId,
          fnbCategory: n.fnbCategory,
          conditionAttribute: n.conditionAttribute,
          conditionMinValue: n.conditionMinValue,
          mandatoryQty: n.mandatoryQty,
        },
      });
      return this.mapSinkingRule(row);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException('Une règle identique (même rôle, catégorie et condition) existe déjà.');
      }
      throw error;
    }
  }

  async updateSinkingRule(id: string, input: any, tenantId: string) {
    const existing = await this.prisma.hrSinkingRule.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrSinkingRule ${id} introuvable`);
    const n = await this.assertValidSinkingRule(input, tenantId, existing);
    try {
      const row = await this.prisma.hrSinkingRule.update({
        where: { id },
        data: {
          fnbCategory: n.fnbCategory,
          conditionAttribute: n.conditionAttribute,
          conditionMinValue: n.conditionMinValue,
          mandatoryQty: n.mandatoryQty,
        },
      });
      return this.mapSinkingRule(row);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException('Une règle identique (même rôle, catégorie et condition) existe déjà.');
      }
      throw error;
    }
  }

  async removeSinkingRule(id: string, tenantId: string) {
    const existing = await this.prisma.hrSinkingRule.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrSinkingRule ${id} introuvable`);
    await this.prisma.hrSinkingRule.delete({ where: { id } });
    return { deleted: true };
  }
}
