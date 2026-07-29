import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { HrService } from './hr.service';
import { HrSuppliersController, HrImportController } from './hr-suppliers.controller';
import { HrRolesController } from './hr-roles.controller';
import { HrPersonsController } from './hr-persons.controller';

@Module({
  imports: [PrismaModule],
  controllers: [HrSuppliersController, HrImportController, HrRolesController, HrPersonsController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
