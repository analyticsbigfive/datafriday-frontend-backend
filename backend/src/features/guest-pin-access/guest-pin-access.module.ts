import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InventoryModule } from '../inventory/inventory.module';
import { SpaceMenusModule } from '../space-menus/space-menus.module';
import { AuditModule } from '../../core/audit/audit.module';
import { JwtGuestPinStrategy } from '../../core/auth/strategies/jwt-guest-pin.strategy';
import { GuestPinAccessService } from './guest-pin-access.service';
import { GuestPinAuthController } from './guest-pin-auth.controller';
import { GuestPinAdminController } from './guest-pin-admin.controller';

@Module({
  imports: [
    InventoryModule, // réutilise InventoryService (getBySpaceAndEvent, saveInventoryCounts, pushCurrentCountToLogistic)
    SpaceMenusModule, // réutilise SpaceMenusService.getShopInventory (catalogue d'items du PDV)
    AuditModule,
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
  controllers: [GuestPinAuthController, GuestPinAdminController],
  providers: [GuestPinAccessService, JwtGuestPinStrategy],
})
export class GuestPinAccessModule {}
