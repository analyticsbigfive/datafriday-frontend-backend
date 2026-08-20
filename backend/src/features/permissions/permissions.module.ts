import { Module } from '@nestjs/common';
import { RbacCatalogSyncService } from '../../core/rbac/rbac-catalog-sync.service';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

@Module({
  controllers: [PermissionsController],
  // RbacCatalogSyncService : propagation du catalogue système au boot
  // (BUG-132-01) — hébergé ici car PermissionsModule est importé
  // inconditionnellement par AppModule (PrismaModule est @Global).
  providers: [PermissionsService, RbacCatalogSyncService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
