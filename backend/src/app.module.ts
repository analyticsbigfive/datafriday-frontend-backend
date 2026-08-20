import { Module } from '@nestjs/common';
import { RouterModule, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ClsModule } from 'nestjs-cls';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './core/database/prisma.module';
import { AuthModule } from './core/auth/auth.module';
import { HealthModule } from './health/health.module';
import { OnboardingModule } from './features/onboarding/onboarding.module';
import { EncryptionModule } from './core/encryption/encryption.module';
import { CacheModule } from './core/cache/cache.module';
import { RedisModule } from './core/redis/redis.module';
import { QueueModule } from './core/queue/queue.module';
import { WeezeventModule } from './features/weezevent/weezevent.module';
import { DigifoodModule } from './features/digifood/digifood.module';
import { OrganizationsModule } from './features/organizations/organizations.module';
import { IntegrationsModule } from './features/integrations/integrations.module';
import { MeModule } from './features/me/me.module';
import { TenantsModule } from './features/tenants/tenants.module';
import { SpacesModule } from './features/spaces/spaces.module';
import { BuilderV2Module } from './features/builder-v2/builder-v2.module';
import { UsersModule } from './features/users/users.module';
import { RolesModule } from './features/roles/roles.module';
import { PermissionsModule } from './features/permissions/permissions.module';
import { OrchestratorModule } from './features/orchestrator/orchestrator.module';
import { SuppliersModule } from './features/suppliers/suppliers.module';
import { MarketPricesModule } from './features/market-prices/market-prices.module';
import { MenuComponentsModule } from './features/menu-components/menu-components.module';
import { MenuItemsModule } from './features/menu-items/menu-items.module';
import { SpaceMenusModule } from './features/space-menus/space-menus.module';
import { IngredientsModule } from './features/ingredients/ingredients.module';
import { PackagingModule } from './features/packaging/packaging.module';
import { EventsModule } from './features/events/events.module';
import { AnalyseModule } from './features/analyse/analyse.module';
import { MappingsModule } from './features/mappings/mappings.module';
import { AggregationModule } from './features/aggregation/aggregation.module';
import { BrandsModule } from './features/brands/brands.module';
import { DisplayNamesModule } from './features/display-names/display-names.module';
import { IndustrialsModule } from './features/industrials/industrials.module';
import { InventoryModule } from './features/inventory/inventory.module';
import { LogisticsModule } from './features/logistics/logistics.module';
import { PackingTypesModule } from './features/packing-types/packing-types.module';
import { PromotionTypesModule } from './features/promotion-types/promotion-types.module';
import { StorageTypesModule } from './features/storage-types/storage-types.module';
import { DepartmentsModule } from './features/departments/departments.module';
import { RestockStateModule } from './features/restock-state/restock-state.module';
import { RestockPlansModule } from './features/restock-plans/restock-plans.module';
import { HistoryAliasesModule } from './features/history-aliases/history-aliases.module';
import { HrSettingsModule } from './features/hr-settings/hr-settings.module';
import { SeasonsModule } from './features/seasons/seasons.module';
import { HrModule } from './features/hr/hr.module';
import { StaffingModule } from './features/staffing/staffing.module';
import { AuditModule } from './core/audit/audit.module';
import { WebhooksModule } from './core/webhooks/webhooks.module';
import { TenantThrottlerGuard } from './core/throttle/tenant-throttler.guard';
import { JwtDatabaseGuard } from './core/auth/guards/jwt-db.guard';
import { RolesGuard } from './core/auth/guards/roles.guard';
import { PermissionsGuard } from './core/auth/guards/permissions.guard';
import { SpaceAccessGuard } from './core/auth/guards/space-access.guard';
import { SpaceAccessModule } from './core/auth/space-access.module';
import { TenantGuard } from './core/auth/guards/tenant.guard';
import { SupabaseModule } from './core/supabase/supabase.module';
import { TenantModule } from './core/tenant/tenant.module';
import { TenantContextInterceptor } from './core/tenant/tenant-context.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Charge le fichier d'env spécifique à l'environnement, avec fallback en cascade.
      // En production/staging/conteneur, on s'appuie aussi sur process.env injecté par l'orchestrateur.
      envFilePath: [
        `envFiles/.env.${process.env.NODE_ENV || 'development'}`,
        'envFiles/.env',
        '.env',
      ],
      expandVariables: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'staging', 'production', 'test')
          .default('development'),
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        PORT: Joi.number().default(3000),
        // Rate limiting (par tenant, cf. TenantThrottlerGuard) — 3 paliers indépendants,
        // chacun surchargeable via env sans redéploiement de code.
        RATE_LIMIT_SHORT_TTL: Joi.number().default(1000),
        RATE_LIMIT_SHORT_MAX: Joi.number().default(20),
        RATE_LIMIT_MEDIUM_TTL: Joi.number().default(60000),
        RATE_LIMIT_MEDIUM_MAX: Joi.number().default(300),
        RATE_LIMIT_LONG_TTL: Joi.number().default(3600000),
        RATE_LIMIT_LONG_MAX: Joi.number().default(5000),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { name: 'short', ttl: config.get<number>('RATE_LIMIT_SHORT_TTL'), limit: config.get<number>('RATE_LIMIT_SHORT_MAX') },
        { name: 'medium', ttl: config.get<number>('RATE_LIMIT_MEDIUM_TTL'), limit: config.get<number>('RATE_LIMIT_MEDIUM_MAX') },
        { name: 'long', ttl: config.get<number>('RATE_LIMIT_LONG_TTL'), limit: config.get<number>('RATE_LIMIT_LONG_MAX') },
      ],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
            : undefined,
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
        ],
        customProps: (req: any) => ({
          tenantId: req.user?.tenantId ?? undefined,
          userId: req.user?.id ?? undefined,
        }),
      },
    }),
    ScheduleModule.forRoot(),
    // Request-scoped context (AsyncLocalStorage) — carries tenantId for
    // automatic Prisma tenant scoping. Mounted as middleware so it wraps the
    // whole request (guards, interceptors, handlers).
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    EncryptionModule,
    CacheModule,
    SupabaseModule,
    TenantModule,
    SpaceAccessModule,
    RedisModule.forRoot(),
    QueueModule,
    PrismaModule,
    AuditModule,
    WebhooksModule,
    AuthModule,
    HealthModule,
    OnboardingModule,
    OrganizationsModule,
    IntegrationsModule,
    WeezeventModule,
    DigifoodModule,
    MeModule,
    TenantsModule,
    SpacesModule,
    BuilderV2Module,
    UsersModule,
    RolesModule,
    PermissionsModule,
    OrchestratorModule,
    SuppliersModule,
    MarketPricesModule,
    MenuComponentsModule,
    MenuItemsModule,
    SpaceMenusModule,
    IngredientsModule,
    PackagingModule,
    EventsModule,
    AnalyseModule,
    MappingsModule,
    AggregationModule,
    BrandsModule,
    DisplayNamesModule,
    IndustrialsModule,
    InventoryModule,
    LogisticsModule,
    PackingTypesModule,
    PromotionTypesModule,
    StorageTypesModule,
    DepartmentsModule,
    RestockStateModule,
    // ⚠ Requiert la table RestockPlan : appliquer prisma/sql/2026-08-04_restockplan.sql
    // AVANT de déployer (ADR-0002/0005) — sinon 500 P2021 au premier appel.
    RestockPlansModule,
    // ⚠ Requiert la table MenuItemHistoryAlias : appliquer la migration
    // 20260811090000_add_menu_item_history_alias AVANT de déployer (ADR-0002)
    // — sinon 500 P2021 au premier appel.
    HistoryAliasesModule,
    HrSettingsModule,
    SeasonsModule,
    HrModule,
    StaffingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global interceptor: pushes the authenticated tenantId into CLS so Prisma
    // auto-scopes queries. Runs after guards (request.user populated).
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    // --- Global guards (executed in registration order) ---
    // 1. Rate limiting (per tenant)
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    // 2. Authentication — populates request.user (skips @Public())
    { provide: APP_GUARD, useClass: JwtDatabaseGuard },
    // 3. Tenant context — fail closed if no tenant (skips @Public()/@AllowNoTenant())
    { provide: APP_GUARD, useClass: TenantGuard },
    // 4. Coarse RBAC — enforces @Roles()
    { provide: APP_GUARD, useClass: RolesGuard },
    // 5. Fine-grained RBAC — enforces @RequirePermissions()
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // 6. Space-scoped access — STAFF/VIEWER limités à leurs espaces accordés
    { provide: APP_GUARD, useClass: SpaceAccessGuard },
  ],
})
export class AppModule { }
