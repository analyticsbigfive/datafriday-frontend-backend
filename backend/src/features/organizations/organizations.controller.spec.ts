import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { SuperAdminGuard } from '../../core/auth/guards/super-admin.guard';
import { ALLOW_NO_TENANT_KEY } from '../../core/auth/decorators/allow-no-tenant.decorator';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  let service: OrganizationsService;

  const mockOrganization = {
    id: 'org-123',
    name: 'Test Organization',
    slug: 'test-org',
    domain: 'test.datafriday.io',
    logo: 'https://example.com/logo.png',
    plan: 'PRO',
    status: 'ACTIVE',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockOrganizationsService = {
    getOrganization: jest.fn(),
    updateOrganization: jest.fn(),
    deleteOrganization: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        {
          provide: OrganizationsService,
          useValue: mockOrganizationsService,
        },
      ],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
    service = module.get<OrganizationsService>(OrganizationsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // BUG-035 — Faille cross-tenant : ce contrôleur opère sur le modèle `Tenant`
  // (non auto-scopé par Prisma) avec un `id` arbitraire. Il DOIT donc rester
  // réservé au super-admin plateforme, comme TenantsController (classe P0-1).
  // Ces tests vérifient le câblage des gardes au niveau de la classe : les tests
  // unitaires ci-dessus n'exécutent pas les guards, ce sont ces métadonnées qui
  // les appliquent réellement en production.
  describe('BUG-035 — durcissement cross-tenant (guards de classe)', () => {
    it('applique SuperAdminGuard sur le contrôleur', () => {
      const guards = Reflect.getMetadata('__guards__', OrganizationsController) || [];
      expect(guards).toContain(SuperAdminGuard);
    });

    it('est marqué @AllowNoTenant() (le super-admin peut ne pas avoir de tenant courant)', () => {
      const allowNoTenant = Reflect.getMetadata(ALLOW_NO_TENANT_KEY, OrganizationsController);
      expect(allowNoTenant).toBe(true);
    });
  });

  describe('getOrganization', () => {
    it('should return an organization', async () => {
      mockOrganizationsService.getOrganization.mockResolvedValue(mockOrganization);

      const result = await controller.getOrganization('org-123');

      expect(result).toEqual(mockOrganization);
      expect(mockOrganizationsService.getOrganization).toHaveBeenCalledWith('org-123');
    });
  });

  describe('updateOrganization', () => {
    it('should update an organization', async () => {
      const updateDto: UpdateOrganizationDto = {
        name: 'Updated Organization',
        logo: 'https://example.com/new-logo.png',
      };
      const updatedOrg = { ...mockOrganization, ...updateDto };
      mockOrganizationsService.updateOrganization.mockResolvedValue(updatedOrg);

      const result = await controller.updateOrganization('org-123', updateDto);

      expect(result).toEqual(updatedOrg);
      expect(mockOrganizationsService.updateOrganization).toHaveBeenCalledWith(
        'org-123',
        updateDto,
      );
    });
  });

  describe('deleteOrganization', () => {
    it('should delete an organization', async () => {
      const deletedOrg = {
        id: 'org-123',
        name: 'Test Organization',
        status: 'SUSPENDED',
      };
      mockOrganizationsService.deleteOrganization.mockResolvedValue(deletedOrg);

      const result = await controller.deleteOrganization('org-123');

      expect(result).toEqual(deletedOrg);
      expect(mockOrganizationsService.deleteOrganization).toHaveBeenCalledWith('org-123');
    });
  });
});
