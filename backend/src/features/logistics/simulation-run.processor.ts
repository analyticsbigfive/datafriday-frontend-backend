import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../../core/queue/queue.constants';
import { PrismaService } from '../../core/database/prisma.service';
import { LogisticsService, SimulationTickJobData } from './logistics.service';

const AUTO_STOP_AFTER_CONSECUTIVE_ERRORS = 10;

/**
 * Worker BullMQ pour les runs d'auto-simulation QA (11_LIVE.md — LiveSaleSimulatorWidget.vue).
 * Un tick = une vente simulée (LogisticsService.simulateSale) sur un PDV/menu item tirés au
 * hasard parmi ceux simulables de l'espace (getSimulableShops). Déclenché par un BullMQ Job
 * Scheduler (upsertJobScheduler, jobSchedulerId = SimulationRun.id) — indépendant de tout
 * onglet navigateur ouvert, cf. LogisticsService.startSimulationRun/stopSimulationRun.
 */
@Processor(QUEUES.SIMULATION, { lockDuration: 30_000 })
export class SimulationRunProcessor extends WorkerHost {
  private readonly logger = new Logger(SimulationRunProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logistics: LogisticsService,
    @InjectQueue(QUEUES.SIMULATION) private readonly queue: Queue<SimulationTickJobData>,
  ) {
    super();
  }

  async process(job: Job<SimulationTickJobData>) {
    const run = await this.prisma.simulationRun.findUnique({ where: { id: job.data.runId } });
    if (!run || run.status !== 'active') {
      // Self-heal : le run a été stoppé/supprimé entre la planification et ce tick (race) —
      // le scheduler ne doit pas continuer à tourner indéfiniment sans plus rien à mettre à jour.
      await this.queue.removeJobScheduler(job.data.runId).catch(() => {});
      return { skipped: true, reason: 'run-not-active' };
    }

    try {
      const shops = (
        await this.logistics.getSimulableShops(run.spaceId, run.tenantId, run.configId ?? undefined)
      ).filter((s) => s.menuItemIds.length > 0);
      const shop = shops.length ? shops[Math.floor(Math.random() * shops.length)] : null;
      if (!shop) {
        await this.prisma.simulationRun.update({
          where: { id: run.id },
          data: { lastTickAt: new Date(), lastTickStatus: 'skipped', tickCount: { increment: 1 } },
        });
        return { skipped: true, reason: 'no-simulable-shop' };
      }

      const menuItemId = shop.menuItemIds[Math.floor(Math.random() * shop.menuItemIds.length)];
      const res = await this.logistics.simulateSale(
        run.spaceId,
        shop.id,
        [{ menuItemId, quantity: 1 }],
        run.tenantId,
        run.startedByUserId ?? undefined,
        run.realMode,
        true,
        run.id,
      );

      await this.prisma.simulationRun.update({
        where: { id: run.id },
        data: {
          lastTickAt: new Date(),
          lastTickStatus: 'ok',
          lastTickError: null,
          tickCount: { increment: 1 },
          consecutiveErrorCount: 0,
          lastElementId: shop.id,
          lastElementName: res.elementName,
          lastTransactionId: res.transactionId,
        },
      });
      return { transactionId: res.transactionId };
    } catch (e: any) {
      // Ne JAMAIS throw ici : le defaultJobOptions global (attempts:3, backoff exponentiel,
      // queue.module.ts) retenterait un tick raté 3x avec des délais croissants, en collision
      // avec la propre cadence du scheduler — même philosophie que
      // LiveSaleSimulatorWidget.vue::autoSimulateOnce, qui avale déjà l'erreur et réessaie
      // simplement au tick suivant.
      const consecutive = run.consecutiveErrorCount + 1;
      const stop = consecutive >= AUTO_STOP_AFTER_CONSECUTIVE_ERRORS;
      await this.prisma.simulationRun.update({
        where: { id: run.id },
        data: {
          lastTickAt: new Date(),
          lastTickStatus: 'error',
          lastTickError: String(e?.message ?? e).slice(0, 500),
          tickCount: { increment: 1 },
          errorCount: { increment: 1 },
          consecutiveErrorCount: consecutive,
          ...(stop ? { status: 'failed', stoppedAt: new Date() } : {}),
        },
      });
      if (stop) await this.queue.removeJobScheduler(run.id).catch(() => {});
      this.logger.warn(`[tick] run ${run.id} KO — ${e?.message}`);
      return { error: e?.message };
    }
  }
}
