import { SpaceAccessService } from './space-access.service';

/**
 * SpaceAccessService pour les tests unitaires : les assertions réelles du service, branchées
 * sur des primitives simulées (accès complet par défaut, espace toujours présent dans le tenant).
 */
export function spaceAccessStub(
  opts: { fullAccess?: boolean; accessible?: 'ALL' | string[]; spaceInTenant?: boolean } = {},
): SpaceAccessService {
  const { fullAccess = true, accessible = 'ALL', spaceInTenant = true } = opts;
  const prisma = {
    space: { findFirst: async ({ where }: any) => (spaceInTenant ? { id: where.id, name: 'Espace' } : null) },
    userSpaceAccess: {
      findMany: async () => (accessible === 'ALL' ? [] : accessible.map((spaceId) => ({ spaceId }))),
      findUnique: async ({ where }: any) =>
        accessible === 'ALL' || accessible.includes(where.userId_spaceId.spaceId) ? { spaceId: where.userId_spaceId.spaceId } : null,
    },
  };
  const service = new SpaceAccessService(prisma as any);
  if (!fullAccess) return service;
  service.hasFullAccess = () => true;
  return service;
}
