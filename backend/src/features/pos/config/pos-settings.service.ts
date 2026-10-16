import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { POS_ERROR_CODES, PosEventSettingDto, PosPdvSettingUpdate } from '../pos.contracts';
import { PosPdvReaderService } from './pos-pdv-reader.service';

/** Réglages de la caisse par évènement et par PdV (lignes typées, extensibles par colonnes). */
@Injectable()
export class PosSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdvReader: PosPdvReaderService,
  ) {}

  async updateEventSettings(
    tenantId: string,
    spaceId: string,
    eventId: string,
    dto: Omit<PosEventSettingDto, 'lowStockUnits' | 'tipsEnabled'> & { lowStockUnits?: number; tipsEnabled?: boolean },
  ): Promise<PosEventSettingDto> {
    await this.requireEvent(tenantId, spaceId, eventId);
    const paymentMethodIds = [...new Set(dto.paymentMethodIds)];
    if (paymentMethodIds.length) {
      const found = await this.prisma.paymentMethod.count({ where: { tenantId, id: { in: paymentMethodIds } } });
      if (found !== paymentMethodIds.length) throw new BadRequestException('Moyen de paiement inconnu pour cette organisation.');
    }
    const data = {
      paymentMethodIds,
      promosEnabled: dto.promosEnabled,
      cancelEnabled: dto.cancelEnabled,
      ...(dto.lowStockUnits != null ? { lowStockUnits: dto.lowStockUnits } : {}),
      ...(dto.tipsEnabled != null ? { tipsEnabled: dto.tipsEnabled } : {}),
    };
    const row = await this.prisma.posEventSetting.upsert({
      where: { eventId },
      create: { tenantId, spaceId, eventId, ...data },
      update: data,
    });
    return {
      paymentMethodIds: row.paymentMethodIds,
      promosEnabled: row.promosEnabled,
      cancelEnabled: row.cancelEnabled,
      lowStockUnits: row.lowStockUnits,
      tipsEnabled: row.tipsEnabled,
    };
  }

  /**
   * Personnes RH actives proposées comme responsable de caisse. Lecture minimale (id, prénom, nom)
   * ouverte avec front.fb.pos : la route RH complète exige menu.hr.manage, qu'un directeur POS n'a
   * pas forcément.
   */
  async listResponsibleCandidates(tenantId: string): Promise<Array<{ id: string; firstName: string; lastName: string }>> {
    return this.prisma.hrPerson.findMany({
      where: { tenantId, active: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  /** Responsable RH d'une caisse : une personne ACTIVE du tenant, ou null pour retirer. */
  async updatePdvSetting(
    tenantId: string,
    spaceId: string,
    eventId: string,
    elementId: string,
    dto: PosPdvSettingUpdate,
    userId: string,
  ): Promise<PosPdvSettingUpdate> {
    const event = await this.requireEvent(tenantId, spaceId, eventId);
    if (!event.configurationId || !(await this.pdvReader.isInConfig(event.configurationId, elementId))) {
      throw new BadRequestException({ code: POS_ERROR_CODES.PDV_NOT_IN_EVENT_CONFIG, message: "Ce point de vente ne fait pas partie de la configuration de l'évènement." });
    }
    const responsibleHrPersonId = dto.responsibleHrPersonId ?? null;
    if (responsibleHrPersonId) {
      const person = await this.prisma.hrPerson.findFirst({ where: { id: responsibleHrPersonId, tenantId, active: true }, select: { id: true } });
      if (!person) throw new BadRequestException('Responsable introuvable ou inactif.');
    }
    await this.prisma.posPdvSetting.upsert({
      where: { eventId_elementId: { eventId, elementId } },
      create: { tenantId, spaceId, eventId, elementId, responsibleHrPersonId, createdBy: userId },
      update: { responsibleHrPersonId },
    });
    return { responsibleHrPersonId };
  }

  private async requireEvent(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, tenantId, spaceId }, select: { id: true, configurationId: true } });
    if (!event) throw new NotFoundException('Évènement introuvable');
    return event;
  }
}
