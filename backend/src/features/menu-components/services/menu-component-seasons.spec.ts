import { BadRequestException } from '@nestjs/common';
import { assertSeasonsBelongToTenant, seasonLinksWrite, withSeasonIds } from './menu-component-seasons';

describe('menu-component-seasons', () => {
  it('withSeasonIds remplace seasonLinks par seasonIds', () => {
    const out = withSeasonIds({ id: 'c1', seasonLinks: [{ seasonId: 's1' }, { seasonId: 's2' }] } as any);
    expect(out).toEqual({ id: 'c1', seasonIds: ['s1', 's2'] });
    expect(withSeasonIds({ id: 'c2' } as any)).toEqual({ id: 'c2', seasonIds: [] });
  });

  it('seasonLinksWrite remplace tout et dédoublonne', () => {
    expect(seasonLinksWrite(['a', 'a', 'b'])).toEqual({ deleteMany: {}, create: [{ seasonId: 'a' }, { seasonId: 'b' }] });
    expect(seasonLinksWrite([])).toEqual({ deleteMany: {}, create: [] });
  });

  it('assertSeasonsBelongToTenant refuse une saison hors tenant', async () => {
    const prisma = { season: { count: jest.fn().mockResolvedValue(1) } } as any;
    await expect(assertSeasonsBelongToTenant(prisma, ['a', 'b'], 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.season.count).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] }, tenantId: 't1' } });
  });

  it('assertSeasonsBelongToTenant ne requete pas si liste vide ou absente', async () => {
    const prisma = { season: { count: jest.fn() } } as any;
    await assertSeasonsBelongToTenant(prisma, undefined, 't1');
    await assertSeasonsBelongToTenant(prisma, [], 't1');
    expect(prisma.season.count).not.toHaveBeenCalled();
  });
});
