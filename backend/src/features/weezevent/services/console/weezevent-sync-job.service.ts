import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { StartSyncJobDto } from '../../dto/start-sync-job.dto';
import { SyncTrackerService } from '../sync-tracker.service';
import { WeezeventCollectWorkerService } from '../weezevent-collect-worker.service';
import { WeezeventInsertWorkerService } from '../weezevent-insert-worker.service';

/**
 * Jobs de synchronisation asynchrones : lancement, suivi, statistiques, annulation et suppression.
 */
@Injectable()
export class WeezeventSyncJobService {
    private readonly logger = new Logger(WeezeventSyncJobService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly syncTracker: SyncTrackerService,
        private readonly collectWorker: WeezeventCollectWorkerService,
        private readonly insertWorker: WeezeventInsertWorkerService,
    ) { }

    /**
     * Démarre un job de sync asynchrone avec bissection.
     * Retourne immédiatement un jobId — le frontend poll GET /sync/status/:jobId.
     */
    async startSyncJob(user: any, dto: StartSyncJobDto) {
        const tenantId = user.tenantId;

        const integration = await this.prisma.integration.findFirst({
            where: { id: dto.integrationId, tenantId, enabled: true },
            select: { id: true, weezevent: { select: { organizationId: true } } },
        });

        if (!integration) {
            throw new BadRequestException(`Intégration Weezevent ${dto.integrationId} introuvable ou désactivée.`);
        }
        if (!integration.weezevent?.organizationId) {
            throw new BadRequestException(`L'organisation Weezevent n'est pas configurée pour cette intégration.`);
        }

        // Refuser si un job est déjà en cours pour cette intégration
        const running = await this.prisma.weezeventSyncJob.findFirst({
            where: { integrationId: dto.integrationId, status: 'COLLECTING' },
            select: { id: true },
        });
        if (running) {
            throw new BadRequestException(`Un job de sync est déjà en cours (jobId: ${running.id}).`);
        }

        // Symétrique de la garde ajoutée dans WeezeventCronService.syncRecentTransactions :
        // le cron (10 min, incrémental) ne passe pas par WeezeventSyncJob — sans cette
        // vérification, un job manuel chunké pourrait démarrer pendant que le cron écrit déjà
        // sur la même intégration.
        if (this.syncTracker.isRunning(tenantId, 'transactions', dto.integrationId)) {
            throw new BadRequestException(`Une synchronisation automatique (cron) est déjà en cours pour cette intégration — réessayez dans quelques instants.`);
        }

        // fromDate/toDate optionnels : sans borne explicite, on reproduit la fenêtre par défaut
        // du chemin incrémental legacy (weezevent-incremental-sync.service.ts) — overlap 5 min
        // depuis le dernier sync connu, ou tout l'historique (epoch → maintenant) au premier sync.
        let fromDate: Date;
        let toDate: Date;
        if (dto.fromDate && dto.toDate) {
            fromDate = new Date(dto.fromDate);
            toDate = new Date(dto.toDate);
        } else {
            const syncState = await this.prisma.weezeventSyncState.findUnique({
                where: {
                    tenantId_integrationId_syncType: {
                        tenantId,
                        integrationId: dto.integrationId,
                        syncType: 'transactions',
                    },
                },
                select: { lastSyncedAt: true },
            });
            fromDate = dto.fromDate
                ? new Date(dto.fromDate)
                : syncState?.lastSyncedAt
                    ? new Date(syncState.lastSyncedAt.getTime() - 5 * 60 * 1000)
                    : new Date(0);
            toDate = dto.toDate ? new Date(dto.toDate) : new Date();
        }

        const job = await this.prisma.weezeventSyncJob.create({
            data: {
                tenantId,
                integrationId: dto.integrationId,
                fromDate,
                toDate,
                status: 'PENDING',
            },
        });

        // Lancer collect + insert en background (sans await)
        this.collectWorker.start(job.id).catch(err =>
            this.logger.error(`[startSyncJob] CollectWorker crash for job ${job.id}: ${err.message}`),
        );
        this.insertWorker.watch(job.id).catch(err =>
            this.logger.error(`[startSyncJob] InsertWorker crash for job ${job.id}: ${err.message}`),
        );

        this.logger.log(`Job de sync démarré: jobId=${job.id} intégration=${dto.integrationId} ${fromDate.toISOString()} → ${toDate.toISOString()}`);

        return { jobId: job.id, status: 'PENDING' };
    }

    /**
     * Retourne l'état en temps réel d'un job de sync.
     * Le frontend poll cet endpoint toutes les 3s.
     */
    async getSyncJobStatus(user: any, jobId: string) {
        const tenantId = user.tenantId;
        const job = await this.prisma.weezeventSyncJob.findFirst({
            where: { id: jobId, tenantId },
            select: {
                id: true,
                status: true,
                fromDate: true,
                toDate: true,
                totalCollected: true,
                totalInserted: true,
                totalChunks: true,
                processedChunks: true,
                collectDone: true,
                errorMessage: true,
                startedAt: true,
                completedAt: true,
            },
        });

        if (!job) throw new NotFoundException(`Job ${jobId} introuvable.`);

        const collectProgress = job.totalChunks > 0
            ? Math.round((job.processedChunks / job.totalChunks) * 100)
            : 0;
        const insertProgress = job.totalCollected > 0
            ? Math.round((job.totalInserted / job.totalCollected) * 100)
            : 0;

        return {
            jobId: job.id,
            status: job.status,
            fromDate: job.fromDate,
            toDate: job.toDate,
            totalCollected: job.totalCollected,
            totalInserted: job.totalInserted,
            totalChunks: job.totalChunks,
            processedChunks: job.processedChunks,
            collectDone: job.collectDone,
            collectProgress,
            insertProgress,
            errorMessage: job.errorMessage,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
        };
    }

    /**
     * Liste les jobs de sync pour une intégration donnée.
     */
    async listSyncJobs(user: any, integrationId: string) {
        const tenantId = user.tenantId;
        const jobs = await this.prisma.weezeventSyncJob.findMany({
            where: { tenantId, integrationId },
            orderBy: { startedAt: 'desc' },
            take: 20,
            select: {
                id: true,
                status: true,
                fromDate: true,
                toDate: true,
                totalCollected: true,
                totalInserted: true,
                startedAt: true,
                completedAt: true,
                errorMessage: true,
            },
        });
        return { data: jobs };
    }

    /**
     * Retourne des statistiques sur les transactions couvertes par un job de sync.
     * Calcule le nombre distinct d'événements, locations et produits dans la plage de dates du job.
     */
    async getSyncJobStats(user: any, jobId: string) {
        const tenantId = user.tenantId;

        const job = await this.prisma.weezeventSyncJob.findFirst({
            where: { id: jobId, tenantId },
            select: { id: true, integrationId: true, fromDate: true, toDate: true, totalCollected: true, totalInserted: true },
        });
        if (!job) throw new NotFoundException(`Job ${jobId} introuvable.`);

        const where = {
            tenantId,
            integrationId: job.integrationId,
            transactionDate: { gte: job.fromDate, lte: job.toDate },
        };

        const [transactionCount, eventGroups, locationGroups, productGroups] = await Promise.all([
            this.prisma.salesTransaction.count({ where }),
            this.prisma.salesTransaction.groupBy({
                by: ['eventId'],
                where: { ...where, eventId: { not: null } },
            }),
            this.prisma.salesTransaction.groupBy({
                by: ['locationId'],
                where: { ...where, locationId: { not: null } },
            }),
            this.prisma.salesTransactionItem.groupBy({
                by: ['productId'],
                where: {
                    productId: { not: null },
                    transaction: where,
                },
            }),
        ]);

        return {
            jobId,
            transactions: transactionCount,
            events: eventGroups.length,
            locations: locationGroups.length,
            products: productGroups.length,
        };
    }

    /**
     * Annule un job de sync bloqué/en cours SANS supprimer son historique — contrairement à
     * DELETE sync/jobs/:jobId (suppression définitive de la fiche). Marque le job CANCELLED ;
     * les workers (collect/insert) vérifient ce statut et s'arrêtent au prochain cycle plutôt
     * que d'être tués immédiatement (cf. WeezeventCollectWorkerService/WeezeventInsertWorkerService).
     */
    async cancelSyncJob(user: any, jobId: string) {
        const tenantId = user.tenantId;

        const job = await this.prisma.weezeventSyncJob.findFirst({
            where: { id: jobId, tenantId },
            select: { id: true, status: true },
        });

        if (!job) {
            throw new NotFoundException(`Job de sync ${jobId} introuvable.`);
        }

        if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
            throw new BadRequestException(`Impossible d'annuler un job déjà terminé (status: ${job.status}).`);
        }

        await this.prisma.weezeventSyncJob.update({
            where: { id: jobId },
            data: {
                status: 'CANCELLED',
                errorMessage: 'Synchronisation annulée manuellement.',
                completedAt: new Date(),
            },
        });

        return { cancelled: true, jobId };
    }

    /**
     * Supprime un job de sync (et ses chunks via cascade).
     * Interdit si le job est encore actif (COLLECTING ou INSERTING).
     */
    async deleteSyncJob(user: any, jobId: string) {
        const tenantId = user.tenantId;

        const job = await this.prisma.weezeventSyncJob.findFirst({
            where: { id: jobId, tenantId },
            select: { id: true, status: true, startedAt: true },
        });

        if (!job) {
            throw new NotFoundException(`Job de sync ${jobId} introuvable.`);
        }

        // Bloquer uniquement si le job a démarré il y a moins de 2 minutes
        // (jobs bloqués par un ancien bug ou un redémarrage serveur peuvent être supprimés)
        if (job.status === 'COLLECTING' || job.status === 'INSERTING') {
            const ageMs = Date.now() - new Date(job.startedAt).getTime();
            if (ageMs < 2 * 60 * 1000) {
                throw new BadRequestException(`Impossible de supprimer un job démarré il y a moins de 2 minutes (status: ${job.status}).`);
            }
            this.logger.warn(`[deleteSyncJob] Suppression forcée d'un job bloqué: ${jobId} status=${job.status}`);
        }

        await this.prisma.weezeventSyncJob.delete({ where: { id: jobId } });

        return { deleted: true, jobId };
    }
}
