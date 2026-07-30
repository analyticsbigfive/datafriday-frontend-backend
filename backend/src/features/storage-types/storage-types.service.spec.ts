import { BadRequestException, ConflictException } from '@nestjs/common';
import { StorageTypesService } from './storage-types.service';

describe('StorageTypesService', () => {
  const mockPrisma = {
    storageType: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    ingredient: { updateMany: jest.fn(), count: jest.fn() },
    packaging: { updateMany: jest.fn(), count: jest.fn() },
    menuComponent: { updateMany: jest.fn(), count: jest.fn() },
    menuItemComponent: { updateMany: jest.fn(), count: jest.fn() },
    menuItemIngredient: { updateMany: jest.fn(), count: jest.fn() },
    menuItemPackaging: { updateMany: jest.fn(), count: jest.fn() },
    menuItem: { count: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  } as any;

  let service: StorageTypesService;

  beforeEach(() => {
    service = new StorageTypesService(mockPrisma);
    jest.clearAllMocks();
    // $transaction([...]) : les opérations sont déjà des promesses résolues par les mocks
    // individuels ci-dessus (comportement identique à packing-types.service.ts).
    mockPrisma.$transaction.mockImplementation((ops: any[]) => Promise.all(ops));
  });

  describe('create', () => {
    // BUG-87 idiom : un doublon insensible à la casse doit être rejeté même si la contrainte
    // DB (@@unique) est case-sensitive.
    it('rejects a case-insensitive duplicate name', async () => {
      mockPrisma.storageType.findFirst.mockResolvedValue({ id: 'existing', name: 'Cold' });

      await expect(service.create('cold', 'tenant-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.storageType.create).not.toHaveBeenCalled();
    });

    it('creates with code always null (tenant-created rows never carry the Builder-stable code)', async () => {
      mockPrisma.storageType.findFirst.mockResolvedValue(null);
      mockPrisma.storageType.create.mockResolvedValue({ id: 'new-1', name: 'Vacuum', code: null, tenantId: 'tenant-1' });

      await service.create('Vacuum', 'tenant-1');

      expect(mockPrisma.storageType.create).toHaveBeenCalledWith({
        data: { name: 'Vacuum', tenantId: 'tenant-1', code: null },
      });
    });
  });

  describe('update', () => {
    it('cascades a rename across all 7 consumer columns in one transaction, including the MenuItem array via array_replace', async () => {
      mockPrisma.storageType.findFirst = jest.fn()
        .mockResolvedValueOnce({ id: 'st-1', name: 'Cold', code: 'cold', tenantId: 'tenant-1' }) // lookup de la ligne
        .mockResolvedValueOnce(null); // assertNoDuplicateName : pas de doublon sur le nouveau nom
      mockPrisma.storageType.update.mockResolvedValue({ id: 'st-1', name: 'Réfrigéré', code: 'cold', tenantId: 'tenant-1' });
      mockPrisma.ingredient.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.packaging.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.menuComponent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.menuItemComponent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.menuItemIngredient.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.menuItemPackaging.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const result = await service.update('st-1', 'Réfrigéré', 'tenant-1');

      expect(result.name).toBe('Réfrigéré');
      // Renommer une ligne `code`-portée reste autorisé : le Builder ne dépend que du code.
      expect(mockPrisma.ingredient.updateMany).toHaveBeenCalledWith({
        where: { storageType: 'Cold', tenantId: 'tenant-1' },
        data: { storageType: 'Réfrigéré' },
      });
      expect(mockPrisma.menuItemComponent.updateMany).toHaveBeenCalledWith({
        where: { storageType: 'Cold', menuItem: { tenantId: 'tenant-1' } },
        data: { storageType: 'Réfrigéré' },
      });
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('skips the whole cascade when the name did not actually change', async () => {
      mockPrisma.storageType.findFirst.mockResolvedValue({ id: 'st-1', name: 'Cold', code: 'cold', tenantId: 'tenant-1' });
      mockPrisma.storageType.update.mockResolvedValue({ id: 'st-1', name: 'Cold', code: 'cold', tenantId: 'tenant-1' });

      await service.update('st-1', 'Cold', 'tenant-1');

      expect(mockPrisma.ingredient.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    // Une ligne historique (code non-null) ne peut jamais être supprimée : le Builder y
    // réfère par ce code stable dans SpaceElement.subtypes[], sans cascade possible.
    it('blocks deletion of a code-bearing (legacy) row regardless of usage', async () => {
      mockPrisma.storageType.findFirst.mockResolvedValue({ id: 'st-1', name: 'Dry', code: 'dry', tenantId: 'tenant-1' });

      await expect(service.remove('st-1', 'tenant-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.storageType.delete).not.toHaveBeenCalled();
      expect(mockPrisma.ingredient.count).not.toHaveBeenCalled();
    });

    it('blocks deletion of a custom row still in use, with a structured deep-link payload', async () => {
      mockPrisma.storageType.findFirst.mockResolvedValue({ id: 'st-2', name: 'Vacuum', code: null, tenantId: 'tenant-1' });
      mockPrisma.ingredient.count.mockResolvedValue(2);
      mockPrisma.packaging.count.mockResolvedValue(0);
      mockPrisma.menuComponent.count.mockResolvedValue(0);
      mockPrisma.menuItemComponent.count.mockResolvedValue(0);
      mockPrisma.menuItemIngredient.count.mockResolvedValue(0);
      mockPrisma.menuItemPackaging.count.mockResolvedValue(0);
      mockPrisma.menuItem.count.mockResolvedValue(0);

      await expect(service.remove('st-2', 'tenant-1')).rejects.toThrow(ConflictException);
      try {
        await service.remove('st-2', 'tenant-1');
      } catch (e: any) {
        expect(e.getResponse()).toMatchObject({ blockedBy: 'storageType', count: 2, filterField: 'storageType', filterValue: 'Vacuum' });
      }
      expect(mockPrisma.storageType.delete).not.toHaveBeenCalled();
    });

    it('deletes a custom, unused row', async () => {
      mockPrisma.storageType.findFirst.mockResolvedValue({ id: 'st-3', name: 'Vacuum', code: null, tenantId: 'tenant-1' });
      for (const model of ['ingredient', 'packaging', 'menuComponent', 'menuItemComponent', 'menuItemIngredient', 'menuItemPackaging', 'menuItem']) {
        mockPrisma[model].count.mockResolvedValue(0);
      }
      mockPrisma.storageType.delete.mockResolvedValue({ id: 'st-3' });

      const result = await service.remove('st-3', 'tenant-1');

      expect(result).toEqual({ deleted: true });
      expect(mockPrisma.storageType.delete).toHaveBeenCalledWith({ where: { id: 'st-3' } });
    });
  });
});
