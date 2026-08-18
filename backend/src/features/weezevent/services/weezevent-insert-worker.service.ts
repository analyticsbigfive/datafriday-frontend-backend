import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventIncrementalSyncService } from './weezevent-incremental-sync.service';
import { SalesPriceAggService } from '../../../shared/pricing/sales-price-agg.service';

const POLL_INTERVAL_MS = 500;
const PARALLEL_CHUNKS = 5;

@Injectable()
export class WeezeventInsertWorkerService {
    private readonly logger = new Logger(WeezeventInsertWorkerService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly incrementalSync: WeezeventIncrementalSyncService,
        private readonly priceAgg: SalesPriceAggService,
    ) {}

    /**
     * Boucle watch — démarre dès que le job est créé, en parallèle du CollectWorkerService.
     * Consomme les chunks PENDING au fur et à mesure qu'ils apparaissent, sans attendre
     * que la bissection soit terminée.
     */
    async watch(jobId: string): Promise<void> {
        this.logger.log(`[InsertWorker] Démarrage watch pour job ${jobId}`);
        try {
            while (true) {
                // Prendre les prochains chunks disponibles
                const chunks = await this.prisma.weezeventSyncChunk.findMany({
                    where: { jobId, status: 'PENDING' },
                    take: PARALLEL_CHUNKS,
                    orderBy: { createdAt: 'asc' },
                });

                if (chunks.length > 0) {
                    await Promise.all(chunks.map(chunk => this.processChunk(chunk, jobId)));
                    continue;
                }

                // Aucun chunk disponible — vérifier l'état du job (tenantId/integrationId :
                // BUG-337-02, docs/bugs/ — nécessaires pour le refresh SalesPriceAgg à COMPLETED)
                const job = await this.prisma.weezeventSyncJob.findUnique({
                    where: { id: jobId },
                    select: { collectDone: true, totalChunks: true, processedChunks: true, status: true, tenantId: true, integrationId: true },
                });

                if (!job || job.status === 'FAILED' || job.status === 'CANCELLED') break;

                if (job.collectDone && job.processedChunks >= job.totalChunks) {
                    await this.prisma.weezeventSyncJob.update({
                        where: { id: jobId },
                        data: { status: 'COMPLETED', completedAt: new Date() },
                    });
                    this.logger.log(`[InsertWorker] Job ${jobId} COMPLETED — ${job.totalChunks} chunks traités`);
                    // BUG-337-02 : insertTransactionBatch (processChunk ci-dessous) saute le refresh
                    // ciblé par chunk pour ce chemin (import historique massif) — un unique
                    // refreshForIntegration ici couvre tout ce qui vient d'être importé. Best-effort,
                    // ne bloque pas la transition COMPLETED (déjà persistée ci-dessus).
                    if (job.totalChunks > 0) {
                        void this.priceAgg.refreshForIntegrationSafe(job.tenantId, job.integrationId);
                    }
                    break;
                }

                // Plus aucun chunk PENDING à traiter, collecte terminée, mais tous les chunks
                // n'ont pas été comptés en succès (processedChunks < totalChunks) : le manque
                // ne peut venir que de chunks passés en FAILED dans processChunk() (les échecs y
                // sont catch silencieusement — voir plus bas). Sans ce garde-fou, la boucle
                // continuerait à poller indéfiniment sans jamais atteindre COMPLETED ni FAILED,
                // laissant le job bloqué à "0/N" pour toujours sans erreur visible nulle part.
                if (job.collectDone) {
                    const failedCount = await this.prisma.weezeventSyncChunk.count({
                        where: { jobId, status: 'FAILED' },
                    });
                    if (failedCount > 0) {
                        await this.prisma.weezeventSyncJob.update({
                            where: { id: jobId },
                            data: {
                                status: 'FAILED',
                                errorMessage: `${failedCount} segment(s) sur ${job.totalChunks} ont échoué à l'insertion en base — voir les logs serveur pour le détail.`,
                                completedAt: new Date(),
                            },
                        });
                        this.logger.error(`[InsertWorker] Job ${jobId} FAILED — ${failedCount}/${job.totalChunks} chunks en échec`);
                        break;
                    }
                }

                // Collecte encore en cours, pause courte avant de reprendre
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
            }
        } catch (err: any) {
            this.logger.error(`[InsertWorker] Job ${jobId} — erreur fatale: ${err.message}`, err.stack);
            await this.prisma.weezeventSyncJob.update({
                where: { id: jobId },
                data: { status: 'FAILED', errorMessage: err.message, completedAt: new Date() },
            }).catch(() => undefined);
        }
    }

    private async processChunk(chunk: any, jobId: string): Promise<void> {
        try {
            // Marquer en cours avant de traiter (évite double-pick par un autre appel parallèle)
            const updated = await this.prisma.weezeventSyncChunk.updateMany({
                where: { id: chunk.id, status: 'PENDING' },
                data: { status: 'PROCESSING' },
            });

            if (updated.count === 0) return; // déjà pris par un autre worker

            const job = await this.prisma.weezeventSyncJob.findUnique({
                where: { id: jobId },
                select: { tenantId: true, integrationId: true },
            });

            if (!job) throw new Error(`Job ${jobId} introuvable`);

            const transactions: any[] = Array.isArray(chunk.rawData) ? chunk.rawData : [];

            await this.incrementalSync.insertTransactionBatch(job.tenantId, job.integrationId, transactions);

            await this.prisma.weezeventSyncChunk.update({
                where: { id: chunk.id },
                data: { status: 'DONE' },
            });

            await this.prisma.weezeventSyncJob.update({
                where: { id: jobId },
                data: {
                    totalInserted: { increment: transactions.length },
                    processedChunks: { increment: 1 },
                },
            });

            this.logger.debug(`[InsertWorker] Chunk ${chunk.id} traité — ${transactions.length} transactions`);
        } catch (err: any) {
            this.logger.error(`[InsertWorker] Chunk ${chunk.id} failed: ${err.message}`, err.stack);
            await this.prisma.weezeventSyncChunk.update({
                where: { id: chunk.id },
                data: { status: 'FAILED', errorMessage: err.message?.slice(0, 2000) },
            }).catch(() => undefined);
            // On ne throw pas pour ne pas bloquer les autres chunks en parallèle
        }
    }
}
