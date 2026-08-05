import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { SimulationRunProcessor } from './simulation-run.processor';
import { PrismaModule } from '../../core/database/prisma.module';
import { QUEUES } from '../../core/queue/queue.constants';
import { PricingModule } from '../../shared/pricing/pricing.module';

@Module({
  imports: [
    PrismaModule,
    // Enregistrée localement (pas dans le QueueModule global) — même pattern que
    // AggregationModule pour QUEUES.AGGREGATION. Pilote les runs d'auto-simulation QA
    // (11_LIVE.md) via un BullMQ Job Scheduler, indépendant de tout onglet navigateur.
    BullModule.registerQueue({ name: QUEUES.SIMULATION }),
    // simulateSale doit facturer le prix DataFriday de l'espace (SpaceMenuItem →
    // MenuItem.basePrice), pas le prix du produit Weezevent mappé — ne dépend que de
    // PrismaModule (@Global), aucun risque de cycle (cf. commentaire pricing.module.ts).
    PricingModule,
  ],
  controllers: [LogisticsController],
  providers: [LogisticsService, SimulationRunProcessor],
  // Exporté pour SpacesModule (Live Inventory, LIVE_API_GUIDE.md §3) — aucun cycle, ni
  // LogisticsModule ni ses dépendances n'importent SpacesModule.
  exports: [LogisticsService],
})
export class LogisticsModule {}
