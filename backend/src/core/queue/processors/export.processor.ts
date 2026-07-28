import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queue.constants';
import { ExportJobData } from '../queue.service';

/**
 * Minimal processor for the EXPORTS queue (BUG-041).
 *
 * The queue was registered in BullMQ (queue.module.ts) with no processor consuming it,
 * so any job pushed via QueueService.queueExport() would sit in `waiting` forever.
 * No caller of queueExport() exists yet, so this is a placeholder — mirrors
 * AnalyticsProcessor/NotificationProcessor: logs, does no real file generation, and
 * marks the job completed. Replace processCsv/processExcel/processPdf with real export
 * generation logic (e.g. streaming to storage, emailing a signed URL) when the export
 * feature is actually implemented.
 */
@Processor(QUEUES.EXPORTS)
export class ExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportProcessor.name);

  async process(job: Job<ExportJobData>): Promise<any> {
    this.logger.log(`Processing ${job.name} for tenant ${job.data.tenantId}`);

    try {
      switch (job.data.type) {
        case 'csv':
          return this.processCsv(job);
        case 'excel':
          return this.processExcel(job);
        case 'pdf':
          return this.processPdf(job);
        default:
          throw new Error(`Unknown export type: ${job.data.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process ${job.name}: ${error.message}`);
      throw error;
    }
  }

  private async processCsv(job: Job<ExportJobData>): Promise<any> {
    const { tenantId, userId, reportType } = job.data;

    this.logger.log(`Generating CSV export (${reportType}) for tenant ${tenantId}`);

    // Placeholder for actual CSV generation
    // In production: query data per reportType, stream to storage, notify userId

    return {
      tenantId,
      userId,
      type: 'csv',
      reportType,
      generatedAt: new Date().toISOString(),
      status: 'generated',
    };
  }

  private async processExcel(job: Job<ExportJobData>): Promise<any> {
    const { tenantId, userId, reportType } = job.data;

    this.logger.log(`Generating Excel export (${reportType}) for tenant ${tenantId}`);

    // Placeholder for actual Excel generation

    return {
      tenantId,
      userId,
      type: 'excel',
      reportType,
      generatedAt: new Date().toISOString(),
      status: 'generated',
    };
  }

  private async processPdf(job: Job<ExportJobData>): Promise<any> {
    const { tenantId, userId, reportType } = job.data;

    this.logger.log(`Generating PDF export (${reportType}) for tenant ${tenantId}`);

    // Placeholder for actual PDF generation

    return {
      tenantId,
      userId,
      type: 'pdf',
      reportType,
      generatedAt: new Date().toISOString(),
      status: 'generated',
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ExportJobData>) {
    this.logger.log(`Export job ${job.id} completed for tenant ${job.data.tenantId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ExportJobData>, error: Error) {
    this.logger.error(
      `Export job ${job.id} failed for tenant ${job.data.tenantId}: ${error.message}`,
    );
  }
}
