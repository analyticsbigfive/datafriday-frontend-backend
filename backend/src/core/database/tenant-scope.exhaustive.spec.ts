import { Prisma } from '@prisma/client';
import { applyTenantScope, buildTenantScopedModelSet, decideTenantScope } from './tenant-scope.util';

/**
 * Isolation exhaustive au niveau du middleware : pour CHAQUE modèle portant un `tenantId`
 * obligatoire (lu dans la DMMF, donc à jour avec le schéma), chaque opération reçoit le
 * filtre ou la valeur du tenant. Un nouveau modèle est couvert sans toucher ce test.
 */
const scopedModels = buildTenantScopedModelSet(Prisma.dmmf.datamodel.models as any);

const WHERE_ACTIONS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
] as const;

describe('isolation tenant : tous les modèles tenant-scopés', () => {
  it('la DMMF expose des modèles tenant-scopés (garde-fou du test lui-même)', () => {
    expect(scopedModels.size).toBeGreaterThan(50);
  });

  describe.each([...scopedModels].sort())('%s', (model) => {
    it.each(WHERE_ACTIONS)('%s : filtre tenantId injecté', (action) => {
      const params = { model, action, args: { where: { id: 'x' } } } as any;
      applyTenantScope(params, 'tenant-A');
      expect(params.args.where).toEqual({ id: 'x', tenantId: 'tenant-A' });
    });

    it('create / createMany / upsert : tenantId posé sur les données', () => {
      const create = { model, action: 'create', args: { data: {} } } as any;
      applyTenantScope(create, 'tenant-A');
      expect(create.args.data.tenantId).toBe('tenant-A');

      const many = { model, action: 'createMany', args: { data: [{}, {}] } } as any;
      applyTenantScope(many, 'tenant-A');
      expect(many.args.data.every((d: any) => d.tenantId === 'tenant-A')).toBe(true);

      const upsert = { model, action: 'upsert', args: { where: { id: 'x' }, create: {}, update: {} } } as any;
      applyTenantScope(upsert, 'tenant-A');
      expect(upsert.args.where.tenantId).toBe('tenant-A');
      expect(upsert.args.create.tenantId).toBe('tenant-A');
    });

    it('hors contexte : refusé ; en contexte tenant : restreint', () => {
      expect(decideTenantScope({ model, scopedModels, hasContext: false, bypass: false, tenantId: undefined })).toEqual({ kind: 'reject' });
      expect(decideTenantScope({ model, scopedModels, hasContext: true, bypass: false, tenantId: 't' })).toEqual({ kind: 'scope', tenantId: 't' });
    });
  });

  it('un modèle sans tenantId obligatoire n’est jamais refusé ni filtré', () => {
    expect(decideTenantScope({ model: 'Tenant', scopedModels, hasContext: false, bypass: false, tenantId: undefined })).toEqual({ kind: 'pass' });
  });
});
