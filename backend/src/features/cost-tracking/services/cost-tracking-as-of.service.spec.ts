import { NotFoundException } from '@nestjs/common';
import { CostTrackingAsOfService } from './cost-tracking-as-of.service';
import { SnapshotPoint } from '../cost-tracking.types';

const snap = (menuItemId: string, at: string, cost: number): SnapshotPoint => ({
  id: `${menuItemId}-s`, menuItemId, effectiveFrom: new Date(at), costPerPiece: cost, totalCost: cost * 2, numberOfPieces: 2, basePrice: 9, reason: 'baseline',
});

function build(event: any, found: Map<string, any>) {
  const prisma: any = {
    event: { findFirst: jest.fn().mockResolvedValue(event) },
    space: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Europe/Paris' }) },
  };
  const reader: any = { readAsOf: jest.fn().mockResolvedValue(found) };
  return { service: new CostTrackingAsOfService(prisma, reader), reader };
}

describe('CostTrackingAsOfService.costsAsOf', () => {
  it('sans heure d ouverture, l instant de référence est minuit local du jour de l event', async () => {
    const { service, reader } = build({ id: 'e1', eventDate: new Date('2026-04-10T00:00:00Z'), spaceId: 'sp', sessions: null }, new Map());
    const res = await service.costsAsOf('tn', { eventId: 'e1', menuItemIds: ['a'] });
    expect(res.referenceSource).toBe('midnight');
    // 10 avril 2026 00:00 à Paris (UTC+2) = 9 avril 22:00 UTC
    expect(res.referenceAt).toBe('2026-04-09T22:00:00.000Z');
    expect(reader.readAsOf).toHaveBeenCalledWith('tn', ['a'], new Date('2026-04-09T22:00:00.000Z'));
  });

  it('utilise l ouverture des portes quand elle est saisie', async () => {
    const sessions = JSON.stringify([{ doorsOpening: '18:30', showTime: '20:00' }]);
    const { service } = build({ id: 'e1', eventDate: new Date('2026-04-10T00:00:00Z'), spaceId: 'sp', sessions }, new Map());
    const res = await service.costsAsOf('tn', { eventId: 'e1', menuItemIds: [] });
    expect(res.referenceSource).toBe('doors_open');
    expect(res.referenceAt).toBe('2026-04-10T16:30:00.000Z');
  });

  it('restitue source snapshot ou baseline, et omet les articles sans snapshot', async () => {
    const found = new Map<string, any>([
      ['a', { snapshot: snap('a', '2026-03-01T00:00:00Z', 1.5), source: 'snapshot' }],
      ['b', { snapshot: snap('b', '2026-09-01T00:00:00Z', 2), source: 'baseline' }],
    ]);
    const { service } = build({ id: 'e1', eventDate: new Date('2026-04-10T00:00:00Z'), spaceId: 'sp', sessions: null }, found);
    const res = await service.costsAsOf('tn', { eventId: 'e1', menuItemIds: ['a', 'b', 'c'] });
    expect(res.costs.a).toMatchObject({ costPerPiece: 1.5, totalCost: 3, source: 'snapshot' });
    expect(res.costs.b.source).toBe('baseline');
    expect(res.costs.c).toBeUndefined();
  });

  it('event inconnu : 404', async () => {
    const { service } = build(null, new Map());
    await expect(service.costsAsOf('tn', { eventId: 'x', menuItemIds: [] })).rejects.toBeInstanceOf(NotFoundException);
  });
});
