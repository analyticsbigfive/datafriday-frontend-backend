import { Module } from '@nestjs/common';
import { EventWeezeventLinkService } from './services/event-weezevent-link.service';
import { EventsController, EventTypesController, EventCategoriesController, EventSubcategoriesController, TeamsController } from './events.controller';
import { PredictVersionsController, PredictVersionsStandaloneController } from './predict-versions.controller';
import { PredictVersionsSummaryController } from './predict-versions-summary.controller';
import { PredictVersionsService } from './predict-versions.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { EventSalesSourcesModule } from '../event-sales-sources/event-sales-sources.module';
import { EventTaxonomyService } from './services/event-taxonomy.service';
import { EventTeamService } from './services/event-team.service';
import { EventsService } from './events.service';
import { EventWeatherService } from './weather/event-weather.service';
import { EventWeatherFillService } from './weather/event-weather-fill.service';
import { EventWeatherCronService } from './weather/event-weather.cron';

@Module({
  imports: [PrismaModule, EventSalesSourcesModule],
  controllers: [
    EventsController,
    EventTypesController,
    EventCategoriesController,
    EventSubcategoriesController,
    TeamsController,
    PredictVersionsController,
    PredictVersionsStandaloneController,
    PredictVersionsSummaryController,
  ],
  providers: [
    EventWeezeventLinkService,
    PredictVersionsService,
    EventTaxonomyService,
    EventTeamService,
    EventsService,
    EventWeatherService,
    EventWeatherFillService,
    EventWeatherCronService,
  ],
  // Seul EventWeezeventLinkService est consommé hors module (par WeezeventModule) —
  // EventsService/PredictVersionsService n'ont aucun consommateur externe.
  exports: [EventWeezeventLinkService],
})
export class EventsModule {}
