import { Test, TestingModule } from '@nestjs/testing';
import { RbacCatalogSyncService } from './rbac-catalog-sync.service';
import { PrismaService } from '../database/prisma.service';
import * as catalog from './permission-catalog';

// Sync du catalogue RBAC au boot (BUG-132-01) : une permission ajoutée au
// catalogue doit atteindre les tenants EXISTANTS au déploiement suivant, sans
// script manuel — et un échec ne doit jamais empêcher le backend de démarrer.

describe('RbacCatalogSyncService', () => {
  let service: RbacCatalogSyncService;

  const tx = { $executeRaw: jest.fn().mockResolvedValue(1) };
  const mockPrisma = {
    // $transaction(fn) : exécute le callback avec un client de transaction stub —
    // le service doit y prendre le verrou consultatif PUIS synchroniser.
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(1);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
    const module: TestingModule = await Test.createTestingModule({
      providers: [RbacCatalogSyncService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(RbacCatalogSyncService);
  });

  it('au boot : verrou consultatif puis ensureSystemPermissionCatalog, dans la MÊME transaction', async () => {
    const ensure = jest.spyOn(catalog, 'ensureSystemPermissionCatalog').mockResolvedValue({});

    await service.onApplicationBootstrap();

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    // Le verrou protège le findFirst-puis-create du catalogue : l'unique
    // [tenantId, code] ne dédoublonne pas tenantId=null (NULLs distincts en
    // Postgres) — deux instances bootant en parallèle dupliqueraient des codes.
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenCalledWith(tx);
    // Ordre : verrou AVANT la synchronisation.
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(ensure.mock.invocationCallOrder[0]);
  });

  it("un échec de sync est loggé et AVALÉ : le boot n'est jamais bloqué", async () => {
    jest.spyOn(catalog, 'ensureSystemPermissionCatalog').mockRejectedValue(new Error('DB down'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('idempotence : un second boot resynchronise sans erreur (le catalogue est idempotent par contrat)', async () => {
    const ensure = jest.spyOn(catalog, 'ensureSystemPermissionCatalog').mockResolvedValue({});

    await service.onApplicationBootstrap();
    await service.onApplicationBootstrap();

    expect(ensure).toHaveBeenCalledTimes(2);
  });
});
