import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { StaffingCalculatorService } from './staffing-calculator.service';
import { StaffingService } from './staffing.service';
import { StaffingController, StaffingCostsController } from './staffing.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StaffingController, StaffingCostsController],
  providers: [StaffingCalculatorService, StaffingService],
  exports: [StaffingCalculatorService, StaffingService],
})
export class StaffingModule {}
