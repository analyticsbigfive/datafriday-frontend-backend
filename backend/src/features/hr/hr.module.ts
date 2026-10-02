import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { HrSuppliersController, HrImportController } from './hr-suppliers.controller';
import { HrRolesController } from './hr-roles.controller';
import { HrPersonsController } from './hr-persons.controller';
import { HrSinkingRulesController } from './hr-sinking-rules.controller';
import { HrRoleMenuItemRatiosController } from './hr-role-menu-item-ratios.controller';
import { HrPersonService } from './services/hr-person.service';
import { HrRoleMenuItemRatioService } from './services/hr-role-menu-item-ratio.service';
import { HrRoleService } from './services/hr-role.service';
import { HrSinkingRuleService } from './services/hr-sinking-rule.service';
import { HrSupplierService } from './services/hr-supplier.service';

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
  providers: [
    HrSupplierService,
    HrRoleService,
    HrSinkingRuleService,
    HrRoleMenuItemRatioService,
    HrPersonService,
  ],
  exports: [
    HrSupplierService,
    HrRoleService,
    HrSinkingRuleService,
    HrRoleMenuItemRatioService,
    HrPersonService,
  ],
})
export class HrModule {}
