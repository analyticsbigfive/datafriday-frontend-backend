import { Module } from '@nestjs/common';
import { GuestPinAccessModule } from '../guest-pin-access.module';
import { SpacesModule } from '../../spaces/spaces.module';
import { InventoryCycleCronService } from './inventory-cycle.cron';
import { InventoryWindowLifecycleCronService } from './inventory-window-lifecycle.cron';

/** Crons des fenêtres d'inventaire PIN (clôture, cycle pre/post). Chargé par BackgroundJobsModule uniquement. */
@Module({
  imports: [GuestPinAccessModule, SpacesModule],
  providers: [InventoryWindowLifecycleCronService, InventoryCycleCronService],
})
export class GuestPinAccessJobsModule {}
