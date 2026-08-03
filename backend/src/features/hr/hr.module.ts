import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { HrService } from './hr.service';
import { HrSuppliersController, HrImportController } from './hr-suppliers.controller';
import { HrRolesController } from './hr-roles.controller';
import { HrPersonsController } from './hr-persons.controller';
import { HrSinkingRulesController } from './hr-sinking-rules.controller';
import { HrRoleMenuItemRatiosController } from './hr-role-menu-item-ratios.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    HrSuppliersController,
    HrImportController,
    HrRolesController,
    HrPersonsController,
    HrSinkingRulesController,
    HrRoleMenuItemRatiosController,
  ],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
