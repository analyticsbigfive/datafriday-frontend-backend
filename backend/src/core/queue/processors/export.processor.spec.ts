import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { ExportProcessor } from './export.processor';
import { ExportJobData } from '../queue.service';

describe('ExportProcessor', () => {
  let processor: ExportProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExportProcessor],
    }).compile();

    processor = module.get<ExportProcessor>(ExportProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should process csv export', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'export-csv',
        data: {
          type: 'csv',
          tenantId: 'tenant-123',
          userId: 'user-456',
          reportType: 'sales',
          params: { dateRange: '30d' },
        },
      } as unknown as Job<ExportJobData>;

      const result = await processor.process(mockJob);

      expect(result).toEqual({
        tenantId: 'tenant-123',
        userId: 'user-456',
        type: 'csv',
        reportType: 'sales',
        generatedAt: expect.any(String),
        status: 'generated',
      });
    });

    it('should process excel export', async () => {
      const mockJob = {
        id: 'job-124',
        name: 'export-excel',
        data: {
          type: 'excel',
          tenantId: 'tenant-123',
          userId: 'user-456',
          reportType: 'inventory',
          params: {},
        },
      } as unknown as Job<ExportJobData>;

      const result = await processor.process(mockJob);

      expect(result).toEqual({
        tenantId: 'tenant-123',
        userId: 'user-456',
        type: 'excel',
        reportType: 'inventory',
        generatedAt: expect.any(String),
        status: 'generated',
      });
    });

    it('should process pdf export', async () => {
      const mockJob = {
        id: 'job-125',
        name: 'export-pdf',
        data: {
          type: 'pdf',
          tenantId: 'tenant-123',
          userId: 'user-456',
          reportType: 'invoice',
          params: {},
        },
      } as unknown as Job<ExportJobData>;

      const result = await processor.process(mockJob);

      expect(result).toEqual({
        tenantId: 'tenant-123',
        userId: 'user-456',
        type: 'pdf',
        reportType: 'invoice',
        generatedAt: expect.any(String),
        status: 'generated',
      });
    });

    it('should throw error for unknown export type', async () => {
      const mockJob = {
        id: 'job-126',
        name: 'export-unknown',
        data: {
          type: 'unknown' as any,
          tenantId: 'tenant-123',
          userId: 'user-456',
          reportType: 'sales',
          params: {},
        },
      } as unknown as Job<ExportJobData>;

      await expect(processor.process(mockJob)).rejects.toThrow(
        'Unknown export type: unknown',
      );
    });
  });

  describe('event handlers', () => {
    it('should log on job completed', () => {
      const logSpy = jest.spyOn(processor['logger'], 'log');
      const mockJob = {
        id: 'job-127',
        data: {
          type: 'csv',
          tenantId: 'tenant-123',
        },
      } as unknown as Job<ExportJobData>;

      processor.onCompleted(mockJob);

      expect(logSpy).toHaveBeenCalledWith(
        'Export job job-127 completed for tenant tenant-123',
      );
    });

    it('should log on job failed', () => {
      const errorSpy = jest.spyOn(processor['logger'], 'error');
      const mockJob = {
        id: 'job-128',
        data: {
          type: 'pdf',
          tenantId: 'tenant-123',
        },
      } as unknown as Job<ExportJobData>;
      const error = new Error('Export generation failed');

      processor.onFailed(mockJob, error);

      expect(errorSpy).toHaveBeenCalledWith(
        'Export job job-128 failed for tenant tenant-123: Export generation failed',
      );
    });
  });
});
