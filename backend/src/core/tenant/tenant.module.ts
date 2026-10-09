import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { TenantContextService } from './tenant-context.service';

/**
 * Contexte tenant (AsyncLocalStorage via nestjs-cls) et son accesseur typé.
 *
 * Importé par l'API ET par le worker : PrismaService injecte ClsService, donc tout
 * process qui charge PrismaModule doit charger ce module. Côté HTTP, le middleware
 * CLS enveloppe chaque requête ; côté worker (pas de serveur HTTP), le middleware
 * n'est jamais monté et le contexte est ouvert par TenantContextService.runForTenant.
 */
@Global()
@Module({
  imports: [ClsModule.forRoot({ global: true, middleware: { mount: true } })],
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantModule {}
