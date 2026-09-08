import { Module } from '@nestjs/common';
import { SpaceMenusController } from './space-menus.controller';
import { SpaceMenusService } from './space-menus.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { PricingModule } from '../../shared/pricing/pricing.module';

@Module({
  imports: [PrismaModule, PricingModule],
  controllers: [SpaceMenusController],
  providers: [SpaceMenusService],
  // Réutilisé par GuestPinAccessModule (catalogue d'items d'un PDV pour l'écran
  // invité) — getShopInventory() était déjà la source de vérité de "quels items
  // compter pour ce shop", pas de logique dupliquée.
  exports: [SpaceMenusService],
})
export class SpaceMenusModule {}
