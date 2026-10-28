import { BadRequestException, ConflictException } from '@nestjs/common';
import { validateJ1Page2Layout, assertKnownKind } from './report-layout.validation';
import { ReportLayoutService } from './report-layout.service';
import { spaceAccessStub } from '../../../core/auth/space-access.testing';

const slot = (over: Record<string, any> = {}) => ({
  id: 's1', kind: 'donut', variant: 'shopType', col: 0, row: 0,
  filters: { selectedMenuItemCategories: ['Beer'] }, options: {},
  label: 'Répartition', addedAt: '2026-10-28T10:00:00Z', addedBy: 'u1', ...over,
});
const doc = (...slots: any[]) => ({ version: 1, slots });
const bad = (l: unknown) => expect(() => validateJ1Page2Layout(l)).toThrow(BadRequestException);

describe('validateJ1Page2Layout', () => {
  it('accepte un layout vide et un layout valide', () => {
    expect(() => validateJ1Page2Layout(doc())).not.toThrow();
    expect(() => validateJ1Page2Layout(doc(
      slot(), slot({ id: 's2', col: 1 }), slot({ id: 's5', col: 1, row: 1 }),
      slot({ id: 's3', kind: 'perf-table', variant: 'shops', row: 1 }),
      slot({ id: 's4', col: 1, row: 2 }),
    ))).not.toThrow();
  });

  it('refuse version, slots et taille invalides', () => {
    bad(null);
    bad({ version: 2, slots: [] });
    bad({ version: 1 });
    bad(doc(...Array.from({ length: 7 }, (_, i) => slot({ id: `s${i}` }))));
    bad(doc(slot({ label: 'x'.repeat(100) , options: { a: 'y'.repeat(70000) } })));
  });

  it('refuse kind et variantes invalides', () => {
    bad(doc(slot({ kind: 'pie' })));
    bad(doc(slot({ variant: 'nope' })));
    bad(doc(slot({ variant: undefined })));
    bad(doc(slot({ kind: 'perf-table', variant: 'brand' })));
    bad(doc(slot({ kind: 'kpi-bar', variant: 'shop' })));
    expect(() => validateJ1Page2Layout(doc(slot({ kind: 'kpi-bar', variant: null })))).not.toThrow();
  });

  it('refuse les positions hors grille et les chevauchements', () => {
    bad(doc(slot({ col: 2 })));
    bad(doc(slot({ row: 3 })));
    bad(doc(slot({ kind: 'kpi-bar', variant: undefined, col: 1 })));
    bad(doc(slot({ kind: 'perf-table', variant: 'shops', row: 2 })));
    bad(doc(slot({ kind: 'revenue-bars', variant: undefined, row: 2 })));
    bad(doc(slot({ kind: 'revenue-bars', variant: undefined }), slot({ id: 's2', col: 1, row: 1 })));
    bad(doc(slot(), slot()));
  });

  it('valide les filtres', () => {
    bad(doc(slot({ filters: { selectedEventIds: ['e1'] } })));
    bad(doc(slot({ filters: { selectedShopIds: 'a' } })));
    bad(doc(slot({ filters: { selectedShopIds: [1] } })));
    bad(doc(slot({ filters: { selectedTimeRange: { start: '25:00', end: '10:00' } } })));
    bad(doc(slot({ filters: { selectedConfigurationId: 3 } })));
    expect(() => validateJ1Page2Layout(doc(slot({
      filters: { selectedTimeRange: { start: '08:00', end: '23:30' }, selectedConfigurationId: null },
    })))).not.toThrow();
  });

  it('valide les options et métadonnées', () => {
    bad(doc(slot({ options: { nested: { a: 1 } } })));
    bad(doc(slot({ label: 'x'.repeat(121) })));
    bad(doc(slot({ addedAt: 'hier' })));
    bad(doc(slot({ addedBy: 5 })));
    bad(doc(slot({ id: '' })));
  });

  it('refuse un kind de rapport inconnu', () => {
    expect(() => assertKnownKind('autre')).toThrow(BadRequestException);
  });
});

describe('ReportLayoutService', () => {
  const prisma: any = { spaceReportLayout: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() } };
  const service = new ReportLayoutService(prisma, spaceAccessStub());
  beforeEach(() => jest.clearAllMocks());

  it('get : layout vide et version 0 si absent', async () => {
    prisma.spaceReportLayout.findUnique.mockResolvedValue(null);
    expect(await service.get('t', 'sp', 'j1-page2')).toEqual({ layout: { version: 1, slots: [] }, version: 0 });
  });

  it('save : création en version 1', async () => {
    prisma.spaceReportLayout.create.mockResolvedValue({ layout: doc(), version: 1 });
    expect(await service.save('t', 'sp', 'j1-page2', doc(), 0)).toEqual({ layout: doc(), version: 1 });
  });

  it('save : 409 si création concurrente ou version périmée', async () => {
    prisma.spaceReportLayout.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.save('t', 'sp', 'j1-page2', doc(), 0)).rejects.toBeInstanceOf(ConflictException);
    prisma.spaceReportLayout.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.save('t', 'sp', 'j1-page2', doc(), 3)).rejects.toBeInstanceOf(ConflictException);
  });

  it('save : incrémente la version', async () => {
    prisma.spaceReportLayout.updateMany.mockResolvedValue({ count: 1 });
    expect((await service.save('t', 'sp', 'j1-page2', doc(), 3)).version).toBe(4);
  });

  it('save : 400 pour un kind inconnu ou un layout invalide', async () => {
    await expect(service.save('t', 'sp', 'x', doc(), 0)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.save('t', 'sp', 'j1-page2', { version: 9 }, 0)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.get('t', 'sp', 'x')).rejects.toBeInstanceOf(BadRequestException);
  });
});
