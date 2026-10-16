import { BadRequestException } from '@nestjs/common';
import { PosSettingsService } from './pos-settings.service';

describe('PosSettingsService', () => {
  let prisma: any;
  let reader: { isInConfig: jest.Mock };
  let service: PosSettingsService;

  beforeEach(() => {
    prisma = {
      event: { findFirst: jest.fn().mockResolvedValue({ id: 'ev', configurationId: 'cfg' }) },
      paymentMethod: { count: jest.fn() },
      posEventSetting: { upsert: jest.fn(async ({ create }: any) => create) },
      posPdvSetting: { upsert: jest.fn().mockResolvedValue({}) },
      hrPerson: { findFirst: jest.fn() },
    };
    reader = { isInConfig: jest.fn().mockResolvedValue(true) };
    service = new PosSettingsService(prisma, reader as any);
  });

  it('réglages évènement : moyens du tenant uniquement, dédoublonnés', async () => {
    prisma.paymentMethod.count.mockResolvedValue(2);
    const out = await service.updateEventSettings('t', 's', 'ev', { paymentMethodIds: ['a', 'b', 'a'], promosEnabled: false, cancelEnabled: true });
    expect(prisma.paymentMethod.count).toHaveBeenCalledWith({ where: { tenantId: 't', id: { in: ['a', 'b'] } } });
    expect(out).toMatchObject({ paymentMethodIds: ['a', 'b'], promosEnabled: false, cancelEnabled: true });
  });

  it('pourboires : tipsEnabled enregistré quand il est fourni, conservé (non écrasé) quand il est absent', async () => {
    await service.updateEventSettings('t', 's', 'ev', { paymentMethodIds: [], promosEnabled: true, cancelEnabled: true, tipsEnabled: true });
    expect(prisma.posEventSetting.upsert.mock.calls[0][0].update).toMatchObject({ tipsEnabled: true });
    await service.updateEventSettings('t', 's', 'ev', { paymentMethodIds: [], promosEnabled: true, cancelEnabled: true });
    expect(prisma.posEventSetting.upsert.mock.calls[1][0].update).not.toHaveProperty('tipsEnabled');
  });

  it('moyen de paiement d\'un autre tenant refusé', async () => {
    prisma.paymentMethod.count.mockResolvedValue(1);
    await expect(service.updateEventSettings('t', 's', 'ev', { paymentMethodIds: ['a', 'x'], promosEnabled: true, cancelEnabled: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.posEventSetting.upsert).not.toHaveBeenCalled();
  });

  it('liste vide acceptée sans requête de contrôle (= tous les moyens actifs)', async () => {
    await service.updateEventSettings('t', 's', 'ev', { paymentMethodIds: [], promosEnabled: true, cancelEnabled: true });
    expect(prisma.paymentMethod.count).not.toHaveBeenCalled();
  });

  it('responsable RH : personne active du tenant, enregistrée avec son auteur', async () => {
    prisma.hrPerson.findFirst.mockResolvedValue({ id: 'hr-1' });
    const out = await service.updatePdvSetting('t', 's', 'ev', 'pdv', { responsibleHrPersonId: 'hr-1' }, 'user-1');
    expect(prisma.hrPerson.findFirst).toHaveBeenCalledWith({ where: { id: 'hr-1', tenantId: 't', active: true }, select: { id: true } });
    expect(prisma.posPdvSetting.upsert.mock.calls[0][0]).toMatchObject({
      where: { eventId_elementId: { eventId: 'ev', elementId: 'pdv' } },
      create: { tenantId: 't', spaceId: 's', createdBy: 'user-1', responsibleHrPersonId: 'hr-1' },
    });
    expect(out).toEqual({ responsibleHrPersonId: 'hr-1' });
  });

  it('responsable inactif ou inconnu refusé ; null retire le responsable', async () => {
    prisma.hrPerson.findFirst.mockResolvedValue(null);
    await expect(service.updatePdvSetting('t', 's', 'ev', 'pdv', { responsibleHrPersonId: 'hr-x' }, 'u')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.posPdvSetting.upsert).not.toHaveBeenCalled();
    await service.updatePdvSetting('t', 's', 'ev', 'pdv', { responsibleHrPersonId: null }, 'u');
    expect(prisma.posPdvSetting.upsert).toHaveBeenCalledTimes(1);
  });

  it('PdV hors de la configuration de l\'évènement refusé', async () => {
    reader.isInConfig.mockResolvedValue(false);
    await expect(service.updatePdvSetting('t', 's', 'ev', 'pdv', { responsibleHrPersonId: null }, 'u')).rejects.toBeInstanceOf(BadRequestException);
  });
});
