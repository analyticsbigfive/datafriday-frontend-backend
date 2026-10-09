import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { TenantModule } from './core/tenant/tenant.module';
import { PrismaModule } from './core/database/prisma.module';
import { EncryptionModule } from './core/encryption/encryption.module';
import { AuditModule } from './core/audit/audit.module';
import { RedisModule } from './core/redis/redis.module';
import { QueueModule } from './core/queue/queue.module';
import { CacheModule } from './core/cache/cache.module';
import { SpaceAccessModule } from './core/auth/space-access.module';
import { SupabaseModule } from './core/supabase/supabase.module';
import { BackgroundJobsModule } from './background-jobs.module';

/**
 * Process worker (pas de serveur HTTP) : seul consommateur des files BullMQ et seul
 * process qui exécute les crons. Même configuration validée que l'API.
 */
@Module({
  imports: [
    AppConfigModule,
    TenantModule,
    PrismaModule,
    EncryptionModule,
    AuditModule,
    // Modules @Global dont les features chargées par les jobs dépendent sans les importer.
    CacheModule,
    SpaceAccessModule,
    SupabaseModule,
    RedisModule.forRoot(),
    QueueModule,
    BackgroundJobsModule,
  ],
})
export class WorkerModule {}
