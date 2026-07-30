import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { HrSettingsService } from './hr-settings.service';
import { HrGoalsController } from './hr-goals.controller';
import { HrStaffRatiosController } from './hr-staff-ratios.controller';

@Module({
  imports: [PrismaModule],
  controllers: [HrGoalsController, HrStaffRatiosController],
  providers: [HrSettingsService],
  exports: [HrSettingsService],
})
export class HrSettingsModule {}
