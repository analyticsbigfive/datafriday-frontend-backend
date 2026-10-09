import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { LogisticsController } from './logistics.controller';
import { LogisticsElementScopeService } from './services/logistics-element-scope.service';
import { StockItemIdentityService } from './services/stock-item-identity.service';
import { RecipeExplosionService } from './services/recipe-explosion.service';
import { StockReferentialService } from './services/stock-referential.service';
import { StockMovementService } from './services/stock-movement.service';
import { StockLossService } from './services/stock-loss.service';
import { StockLevelService } from './services/stock-level.service';
import { StockReconciliationService } from './services/stock-reconciliation.service';
import { SalesSimulationService } from './services/sales-simulation.service';
import { VentilationDepositsService } from './ventilation-deposits.service';
import { VentilationEventsService } from './ventilation-events.service';
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
  providers: [
    LogisticsElementScopeService,
    StockItemIdentityService,
    RecipeExplosionService,
    StockReferentialService,
    StockMovementService,
    StockLossService,
    StockLevelService,
    StockReconciliationService,
    SalesSimulationService,
    VentilationDepositsService,
    VentilationEventsService,
  ],
  // Utilisés par l'inventaire, les tâches logistiques, les espaces (inventaire live) et le worker
  // (simulation). Aucun cycle : ni ce module ni ses dépendances n'importent SpacesModule.
  // VentilationDepositsService / VentilationEventsService : accès PIN des logisticiens (GuestPinAccessModule).
  exports: [
    StockItemIdentityService,
    StockMovementService,
    StockLevelService,
    StockReconciliationService,
    StockReferentialService,
    SalesSimulationService,
    VentilationDepositsService,
    VentilationEventsService,
  ],
})
export class LogisticsModule {}
