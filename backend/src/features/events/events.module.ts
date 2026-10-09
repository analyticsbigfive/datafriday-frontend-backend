import { Module } from '@nestjs/common';
import { EventWeezeventLinkService } from './services/event-weezevent-link.service';
import { EventsController, EventTypesController, EventCategoriesController, EventSubcategoriesController, TeamsController } from './events.controller';
import { PredictVersionsController, PredictVersionsStandaloneController } from './predict-versions.controller';
import { PredictVersionsService } from './predict-versions.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { EventTaxonomyService } from './services/event-taxonomy.service';
import { EventTeamService } from './services/event-team.service';
import { EventsService } from './events.service';

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
  providers: [
    EventWeezeventLinkService,
    PredictVersionsService,
    EventTaxonomyService,
    EventTeamService,
    EventsService,
  ],
  // Seul EventWeezeventLinkService est consommé hors module (par WeezeventModule) —
  // EventsService/PredictVersionsService n'ont aucun consommateur externe.
  exports: [EventWeezeventLinkService],
})
export class EventsModule {}
