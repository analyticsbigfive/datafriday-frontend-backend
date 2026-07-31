import { BadRequestException, ConflictException } from '@nestjs/common';
import { DepartmentsService } from './departments.service';

describe('DepartmentsService', () => {
  const mockPrisma = {
    department: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    subtype: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  } as any;

  let service: DepartmentsService;

  beforeEach(() => {
    service = new DepartmentsService(mockPrisma);
    jest.clearAllMocks();
  });

  describe('createDepartment', () => {
    it('rejects a case-insensitive duplicate name', async () => {
      mockPrisma.department.findFirst.mockResolvedValue({ id: 'existing', name: 'Kitchen' });

      await expect(service.createDepartment({ name: 'kitchen' })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.department.create).not.toHaveBeenCalled();
    });

    it('creates with code always null (departments created by super-admin never carry the Builder-stable code)', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null);
      mockPrisma.department.create.mockResolvedValue({ id: 'new-1', name: 'Sponsoring', code: null });

      await service.createDepartment({ name: 'Sponsoring', color: '#ff0000', icon: 'mdi-star' });

      expect(mockPrisma.department.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ name: 'Sponsoring', code: null, color: '#ff0000', icon: 'mdi-star' }),
      }));
    });
  });

  describe('updateDepartment', () => {
    it('allows renaming a code-bearing (legacy) department', async () => {
      mockPrisma.department.findFirst = jest.fn()
        .mockResolvedValueOnce({ id: 'd-1', name: 'Kitchen', code: 'kitchen' }) // lookup
        .mockResolvedValueOnce(null); // dup check
      mockPrisma.department.update.mockResolvedValue({ id: 'd-1', name: 'Cuisine', code: 'kitchen' });

      const result = await service.updateDepartment('d-1', { name: 'Cuisine' });

      expect(result.name).toBe('Cuisine');
      expect(mockPrisma.department.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'd-1' },
        data: expect.objectContaining({ name: 'Cuisine' }),
      }));
    });
  });

  describe('deleteDepartment', () => {
    it('blocks deletion of a code-bearing (legacy) department regardless of dependents', async () => {
      mockPrisma.department.findFirst.mockResolvedValue({ id: 'd-1', name: 'Storage', code: 'storage' });

      await expect(service.deleteDepartment('d-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.department.delete).not.toHaveBeenCalled();
      expect(mockPrisma.subtype.count).not.toHaveBeenCalled();
    });

    it('blocks deletion of a custom department that still has subtypes, with a structured deep-link payload', async () => {
      mockPrisma.department.findFirst.mockResolvedValue({ id: 'd-2', name: 'Sponsoring', code: null });
      mockPrisma.subtype.count.mockResolvedValue(3);

      await expect(service.deleteDepartment('d-2')).rejects.toThrow(ConflictException);
      try {
        await service.deleteDepartment('d-2');
      } catch (e: any) {
        expect(e.getResponse()).toMatchObject({ blockedBy: 'subtypes', count: 3, filterField: 'department', filterValue: 'Sponsoring' });
      }
      expect(mockPrisma.department.delete).not.toHaveBeenCalled();
    });

    it('deletes a custom department with no subtypes', async () => {
      mockPrisma.department.findFirst.mockResolvedValue({ id: 'd-3', name: 'Sponsoring', code: null });
      mockPrisma.subtype.count.mockResolvedValue(0);
      mockPrisma.department.delete.mockResolvedValue({ id: 'd-3' });

      const result = await service.deleteDepartment('d-3');

      expect(result).toEqual({ deleted: true });
      expect(mockPrisma.department.delete).toHaveBeenCalledWith({ where: { id: 'd-3' } });
    });
  });

  describe('createSubtype', () => {
    it('rejects if the department does not exist', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null);

      await expect(service.createSubtype('Vegan', 'dept-x')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.subtype.create).not.toHaveBeenCalled();
    });

    it('creates with code always null', async () => {
      mockPrisma.department.findFirst.mockResolvedValue({ id: 'dept-1' });
      mockPrisma.subtype.findFirst.mockResolvedValue(null);
      mockPrisma.subtype.create.mockResolvedValue({ id: 'st-1', name: 'Vegan', code: null, departmentId: 'dept-1' });

      await service.createSubtype('Vegan', 'dept-1');

      expect(mockPrisma.subtype.create).toHaveBeenCalledWith(expect.objectContaining({
        data: { departmentId: 'dept-1', name: 'Vegan', code: null },
      }));
    });
  });

  describe('deleteSubtype', () => {
    it('blocks deletion of a code-bearing (legacy) subtype', async () => {
      mockPrisma.subtype.findFirst.mockResolvedValue({ id: 'st-1', name: 'Dry storage', code: 'dry' });

      await expect(service.deleteSubtype('st-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.subtype.delete).not.toHaveBeenCalled();
    });

    it('deletes a custom subtype', async () => {
      mockPrisma.subtype.findFirst.mockResolvedValue({ id: 'st-2', name: 'Vegan', code: null });
      mockPrisma.subtype.delete.mockResolvedValue({ id: 'st-2' });

      const result = await service.deleteSubtype('st-2');

      expect(result).toEqual({ deleted: true });
    });
  });
});
