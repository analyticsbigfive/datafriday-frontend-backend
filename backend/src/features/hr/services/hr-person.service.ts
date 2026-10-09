import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { HR_PERSON_CONTRACTS } from '../hr.constants';

/**
 * Personnes du référentiel RH.
 */
@Injectable()
export class HrPersonService {
  constructor(
    private prisma: PrismaService,
  ) {}

  private mapPerson(p: any) {
    return {
      id: p.id,
      roleId: p.roleId,
      firstName: p.firstName,
      lastName: p.lastName,
      contractType: p.contractType,
      hourlyRate: p.hourlyRate,
      active: p.active,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  // ── Persons ────────────────────────────────────────────────────────────────

  async findAllPersons(tenantId: string, filter: { roleId?: string; contractType?: string }) {
    const rows = await this.prisma.hrPerson.findMany({
      where: {
        tenantId,
        ...(filter.roleId && { roleId: filter.roleId }),
        ...(filter.contractType && { contractType: filter.contractType }),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return { data: rows.map((p) => this.mapPerson(p)) };
  }

  async createPerson(
    input: {
      roleId: string;
      firstName: string;
      lastName: string;
      contractType: string;
      hourlyRate?: number;
      active?: boolean;
    },
    tenantId: string,
  ) {
    if (!(HR_PERSON_CONTRACTS as readonly string[]).includes(input.contractType)) {
      throw new BadRequestException(`contractType invalide pour une personne : ${input.contractType}`);
    }
    const role = await this.prisma.hrRole.findFirst({ where: { id: input.roleId, tenantId } });
    if (!role) throw new BadRequestException(`Rôle ${input.roleId} introuvable`);
    const row = await this.prisma.hrPerson.create({
      data: {
        tenantId,
        roleId: input.roleId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        contractType: input.contractType,
        hourlyRate: input.hourlyRate ?? null,
        active: input.active ?? true,
      },
    });
    return this.mapPerson(row);
  }

  async updatePerson(id: string, input: any, tenantId: string) {
    const existing = await this.prisma.hrPerson.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrPerson ${id} introuvable`);
    if (input.contractType !== undefined && !(HR_PERSON_CONTRACTS as readonly string[]).includes(input.contractType)) {
      throw new BadRequestException(`contractType invalide : ${input.contractType}`);
    }
    if (input.roleId !== undefined) {
      const role = await this.prisma.hrRole.findFirst({ where: { id: input.roleId, tenantId } });
      if (!role) throw new BadRequestException(`Rôle ${input.roleId} introuvable`);
    }
    const row = await this.prisma.hrPerson.update({
      where: { id },
      data: {
        ...(input.roleId !== undefined && { roleId: input.roleId }),
        ...(input.firstName !== undefined && { firstName: String(input.firstName).trim() }),
        ...(input.lastName !== undefined && { lastName: String(input.lastName).trim() }),
        ...(input.contractType !== undefined && { contractType: input.contractType }),
        ...(input.hourlyRate !== undefined && { hourlyRate: input.hourlyRate }),
        ...(input.active !== undefined && { active: input.active }),
      },
    });
    return this.mapPerson(row);
  }

  async removePerson(id: string, tenantId: string) {
    const existing = await this.prisma.hrPerson.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrPerson ${id} introuvable`);
    await this.prisma.hrPerson.delete({ where: { id } });
    return { deleted: true };
  }
}
