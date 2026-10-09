import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InventoryModule } from '../inventory/inventory.module';
import { MenuItemsModule } from '../menu-items/menu-items.module';
import { MarketPricesModule } from '../market-prices/market-prices.module';
import { MenuComponentsModule } from '../menu-components/menu-components.module';
import { AuditModule } from '../../core/audit/audit.module';
import { JwtGuestPinStrategy } from '../../core/auth/strategies/jwt-guest-pin.strategy';
import { GuestPinAuthController } from './guest-pin-auth.controller';
import { GuestPinAdminController } from './guest-pin-admin.controller';
import { SpaceMenusModule } from '../space-menus/space-menus.module';
import { StorageTypesModule } from '../storage-types/storage-types.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { VentilationAccessService } from './ventilation-access.service';
import { VentilationAdminController } from './ventilation-admin.controller';
import { GuestPinCountingService } from './services/guest-pin-counting.service';
import { GuestPinCredentialService } from './services/guest-pin-credential.service';
import { GuestPinSessionService } from './services/guest-pin-session.service';
import { GuestPinWindowService } from './services/guest-pin-window.service';
import { GuestPinPhaseService } from './services/guest-pin-phase.service';

@Module({
  imports: [
    InventoryModule, // réutilise InventoryService (getBySpaceAndEvent, saveInventoryCounts, pushCurrentCountToLogistic)
    // Catalogue invité = MÊME algorithme que le staff (buildConsolidatedInventory, appelé
    // côté client) nourri par les MÊMES sources — getRecipes réutilise buildRecipeComponents
    // (menuItem.components fusionné ingrédients+composants+packaging), jamais une resucée.
    MenuItemsModule,
    MarketPricesModule,
    MenuComponentsModule,
    // Catalogue invité d'un stockage : PdV de la config et leurs articles (même
    // batch que l'écran staff) + référentiel des types de stockage.
    SpaceMenusModule,
    StorageTypesModule,
    AuditModule,
    LogisticsModule, // accès Ventilation : dépôts (mouvements VENTILATION) et leur annulation
    PassportModule,
    // JwtModule DÉDIÉ, secret distinct de celui d'AuthModule (JWT_SECRET, réservé
    // à la vérification des tokens Supabase) — ne jamais les faire cohabiter.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('GUEST_PIN_JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('GUEST_PIN_JWT_TTL') || '1d' },
      }),
    }),
  ],
  controllers: [GuestPinAuthController, GuestPinAdminController, VentilationAdminController],
  providers: [
    JwtGuestPinStrategy,
    GuestPinCredentialService,
    GuestPinSessionService,
    GuestPinCountingService,
    GuestPinWindowService,
    GuestPinPhaseService,
    VentilationAccessService,
  ],
  // Crons des fenêtres (GuestPinAccessJobsModule) : clôture, préparation, démarrages et arrêts.
  exports: [GuestPinWindowService, GuestPinPhaseService],
})
export class GuestPinAccessModule {}
