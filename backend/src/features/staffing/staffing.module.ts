import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { StaffingCalculatorService } from './staffing-calculator.service';
import { StaffingController, StaffingCostsController } from './staffing.controller';
import { StaffingContextService } from './services/staffing-context.service';
import { StaffingGenerationService } from './services/staffing-generation.service';
import { StaffingService } from './staffing.service';

@Module({
  imports: [PrismaModule],
  controllers: [StaffingController, StaffingCostsController],
  providers: [StaffingCalculatorService,
    StaffingContextService,
    StaffingGenerationService,
    StaffingService,
  ],
  exports: [StaffingCalculatorService,
    StaffingContextService,
    StaffingGenerationService,
    StaffingService,
  ],
})
export class StaffingModule {}
