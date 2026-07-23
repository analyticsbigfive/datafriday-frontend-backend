import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventClientService } from './weezevent-client.service';

/**
 * Weezevent API hard cap : toujours 500 items max, total_pages toujours 1.
 * La pagination ne fonctionne pas. Seule la bissection par plage de dates
 * permet de récupérer l'intégralité des données (cf. WEEZEVENT_TRANSACTION_FETCH.md).
 */
const WEEZEVENT_CAP = 500;

@Injectable()
export class WeezeventCollectWorkerService {
    private readonly logger = new Logger(WeezeventCollectWorkerService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly weezeventClient: WeezeventClientService,
    ) {}

    /**
     * Lance la bissection récursive sur la plage de dates du job
     * (même logique que fetchChunk dans StepProcessTimeline.vue).
     * Chaque sous-plage < 500 items devient un chunk PENDING.
     * S'exécute en background ; InsertWorkerService consomme les chunks en parallèle.
     */
    async start(jobId: string): Promise<void> {
        try {
            const job = await this.prisma.weezeventSyncJob.update({
                where: { id: jobId },
                data: { status: 'COLLECTING' },
                include: { integration: { include: { weezevent: true } } },
            });

            const tenantId = job.tenantId;
            const integrationId = job.integrationId;
            const organizationId = job.integration.weezevent?.organizationId ?? null;

            if (!organizationId) {
                throw new Error(`organizationId manquant pour l'intégration ${job.integrationId}`);
            }

            await this.fetchChunk(
                tenantId,
                integrationId,
                organizationId,
                jobId,
                job.fromDate.toISOString(),
                job.toDate.toISOString(),
            );

            await this.prisma.weezeventSyncJob.update({
                where: { id: jobId },
                data: { collectDone: true },
            });

            this.logger.log(`[CollectWorker] Job ${jobId} — bissection terminée`);
        } catch (err: any) {
            this.logger.error(`[CollectWorker] Job ${jobId} — erreur: ${err.message}`, err.stack);
            await this.prisma.weezeventSyncJob.update({
                where: { id: jobId },
                data: { status: 'FAILED', errorMessage: err.message, completedAt: new Date() },
            }).catch(() => undefined);
        }
    }

    /**
     * Bissection récursive identique au fetchChunk du panel debug frontend.
     * - Si total < 500 → sous-plage complète, on sauvegarde le chunk.
     * - Si total >= 500 → cap atteint, on coupe la plage en deux et on recommence.
     * - Si plage < 1 seconde → irréductible, on sauvegarde quand même.
     */
    private async fetchChunk(
        tenantId: string,
        integrationId: string,
        organizationId: string,
        jobId: string,
        fromIso: string,
        toIso: string,
    ): Promise<void> {
        // Annulation manuelle (PATCH sync/jobs/:jobId/cancel) : on arrête la bissection au
        // prochain nœud de récursion plutôt que de continuer à consommer l'API Weezevent
        // pour un job dont l'utilisateur ne veut plus attendre le résultat.
        const current = await this.prisma.weezeventSyncJob.findUnique({
            where: { id: jobId },
            select: { status: true },
        });
        if (current?.status === 'CANCELLED') {
            this.logger.log(`[fetchChunk] Job ${jobId} annulé — arrêt de la bissection.`);
            return;
        }

        const result = await this.weezeventClient.getTransactions(tenantId, integrationId, organizationId, {
            fromDate: new Date(fromIso),
            toDate: new Date(toIso),
            perPage: WEEZEVENT_CAP,
        });

        const items = result.data ?? [];
        const total = result.meta?.total ?? items.length;
        const capAtteint = items.length >= WEEZEVENT_CAP || total >= WEEZEVENT_CAP;

        this.logger.debug(`[fetchChunk] ${fromIso} → ${toIso} | total=${total} data=${items.length} cap=${capAtteint}`);

        if (!capAtteint) {
            await this.saveChunk(jobId, fromIso, toIso, items);
            return;
        }

        const startMs = new Date(fromIso).getTime();
        const endMs = new Date(toIso).getTime();

        if (endMs - startMs < 1000) {
            this.logger.warn(`[fetchChunk] Plage < 1s irréductible — sauvegarde partielle (${items.length} items)`);
            await this.saveChunk(jobId, fromIso, toIso, items);
            return;
        }

        const midMs = Math.floor((startMs + endMs) / 2);
        await this.fetchChunk(tenantId, integrationId, organizationId, jobId, fromIso, new Date(midMs - 1).toISOString());
        await this.fetchChunk(tenantId, integrationId, organizationId, jobId, new Date(midMs).toISOString(), toIso);
    }

    private async saveChunk(jobId: string, fromDate: string, toDate: string, data: any[]): Promise<void> {
        await this.prisma.weezeventSyncChunk.create({
            data: {
                jobId,
                fromDate: new Date(fromDate),
                toDate: new Date(toDate),
                itemCount: data.length,
                rawData: data as any,
                status: 'PENDING',
            },
        });

        await this.prisma.weezeventSyncJob.update({
            where: { id: jobId },
            data: {
                totalChunks: { increment: 1 },
                totalCollected: { increment: data.length },
            },
        });
    }
}

