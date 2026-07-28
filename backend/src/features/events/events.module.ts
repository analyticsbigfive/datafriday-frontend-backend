import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventWeezeventLinkService } from './services/event-weezevent-link.service';
import { EventsController, EventTypesController, EventCategoriesController, EventSubcategoriesController, TeamsController } from './events.controller';
import { PredictVersionsController, PredictVersionsStandaloneController } from './predict-versions.controller';
import { PredictVersionsService } from './predict-versions.service';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    EventsController,
    EventTypesController,
    EventCategoriesController,
    EventSubcategoriesController,
    TeamsController,
    PredictVersionsController,
    PredictVersionsStandaloneController,
  ],
  providers: [EventsService, EventWeezeventLinkService, PredictVersionsService],
  // Seul EventWeezeventLinkService est consommé hors module (par WeezeventModule) —
  // EventsService/PredictVersionsService n'ont aucun consommateur externe.
  exports: [EventWeezeventLinkService],
})
export class EventsModule {}
