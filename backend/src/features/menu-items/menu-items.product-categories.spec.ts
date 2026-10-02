import { BadRequestException } from '@nestjs/common';
import { createMenuItemsServices } from './services/menu-items-services.testing';

describe('MenuItemsService product categories', () => {
  const mockPrisma = {
    productType: {
      findFirst: jest.fn(),
    },
    productCategory: {
      // Contrôle d'unicité insensible à la casse avant création : aucun doublon ici.
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
  } as any;

  const mockRedis = {} as any;
  const mockPricing = {} as any;
  const mockStorage = { resolveImage: jest.fn((value) => Promise.resolve(value)) } as any;
  const mockSpaceAccess = {} as any;
  let productTaxonomyService: any;

  beforeEach(() => {
    ({ productTaxonomyService } = createMenuItemsServices({ prisma: mockPrisma, redis: mockRedis, pricing: mockPricing, storage: mockStorage, spaceAccess: mockSpaceAccess }));
    jest.clearAllMocks();
  });

  it('creates a product category with typeId', async () => {
    mockPrisma.productType.findFirst.mockResolvedValue({ id: 'type-1', tenantId: 'tenant-1' });
    mockPrisma.productCategory.create.mockResolvedValue({ id: 'cat-1', name: 'Food' });

    const result = await productTaxonomyService.createProductCategory('Food', 'type-1', 'tenant-1');

    expect(result.name).toBe('Food');
    expect(mockPrisma.productCategory.create).toHaveBeenCalledWith({
      data: {
        name: 'Food',
        tenantId: 'tenant-1',
        type: {
          connect: { id: 'type-1' },
        },
      },
      include: { type: true },
    });
  });

  it('creates a product category with productTypeId alias', async () => {
    mockPrisma.productType.findFirst.mockResolvedValue({ id: 'type-1', tenantId: null });
    mockPrisma.productCategory.create.mockResolvedValue({ id: 'cat-1', name: 'Food' });

    await productTaxonomyService.createProductCategory('Food', undefined as any, 'tenant-1', 'type-1');

    expect(mockPrisma.productCategory.create).toHaveBeenCalledWith({
      data: {
        name: 'Food',
        tenantId: 'tenant-1',
        type: {
          connect: { id: 'type-1' },
        },
      },
      include: { type: true },
    });
  });

  it('throws a detailed BadRequestException when type is missing', async () => {
    await expect(productTaxonomyService.createProductCategory('Food', undefined as any, 'tenant-1')).rejects.toThrow(
      BadRequestException,
    );

    await productTaxonomyService.createProductCategory('Food', undefined as any, 'tenant-1').catch((error) => {
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          message: 'Validation failed',
          errors: expect.arrayContaining([
            expect.objectContaining({
              property: 'typeId',
              messages: expect.arrayContaining([
                'typeId should not be empty',
                'typeId must be a string',
              ]),
            }),
          ]),
        }),
      );
    });
  });

  it('throws a detailed BadRequestException when type is not accessible', async () => {
    mockPrisma.productType.findFirst.mockResolvedValue(null);

    await expect(productTaxonomyService.createProductCategory('Food', 'type-404', 'tenant-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
