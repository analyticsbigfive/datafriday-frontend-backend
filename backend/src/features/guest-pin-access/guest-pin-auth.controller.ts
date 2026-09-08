import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Headers,
  Ip,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../core/auth/decorators/public.decorator';
import { JwtGuestPinGuard } from '../../core/auth/guards/jwt-guest-pin.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import type { GuestPinUser } from '../../core/auth/strategies/jwt-guest-pin.strategy';
import { GuestPinAccessService } from './guest-pin-access.service';
import { LoginPinDto } from './dto/login-pin.dto';
import { SaveGuestCountDto } from './dto/save-guest-count.dto';

/**
 * Surface invité (managers de PDV sans compte). @Public() neutralise les guards
 * globaux staff (JwtDatabaseGuard/TenantGuard, cf. app.module.ts) — l'authentification
 * réelle passe par JwtGuestPinGuard, appliqué localement.
 *
 * Aucune route ici n'accepte spaceId/elementId/eventId en entrée : tout vient de
 * `request.user` (payload du JWT invité, résolu en base à chaque requête par
 * JwtGuestPinStrategy — révocation immédiate garantie).
 */
@ApiTags('Guest PIN')
@Controller('guest-pin')
@Public()
export class GuestPinAuthController {
  constructor(private readonly service: GuestPinAccessService) {}

  @Get('context/:slug/:phase')
  @ApiOperation({ summary: "Nom du PDV + fenêtre active ou non, résolus depuis l'URL scannée (avant tout PIN)" })
  async context(@Param('slug') slug: string, @Param('phase') phase: string) {
    return this.service.getPublicContext(slug, phase);
  }

  @Post('login/:slug/:phase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion invité par PIN (manager de PDV, sans compte)' })
  async login(
    @Param('slug') slug: string,
    @Param('phase') phase: string,
    @Body() dto: LoginPinDto,
    @Headers('x-guest-device-id') deviceId: string | undefined,
    @Ip() ip: string,
  ) {
    return this.service.login(dto.pin, deviceId, ip, slug, phase);
  }

  @Get('session')
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: 'État courant de la session invité (réhydratation après refresh)' })
  async session(@CurrentUser() user: GuestPinUser) {
    return this.service.getSession(user);
  }

  @Get('inventory')
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: "Inventaire filtré au PDV de l'invité" })
  async inventory(@CurrentUser() user: GuestPinUser) {
    return this.service.getInventory(user);
  }

  @Get('inventory/baseline')
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: "Quantités attendues filtrées au PDV de l'invité (si autorisé)" })
  async baseline(@CurrentUser() user: GuestPinUser) {
    return this.service.getBaseline(user);
  }

  @Post('inventory/counts')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: 'Sauvegarde un comptage pour le PDV de l\'invité' })
  async saveCount(@CurrentUser() user: GuestPinUser, @Body() dto: SaveGuestCountDto) {
    return this.service.saveCount(user, dto);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuestPinGuard)
  @ApiBearerAuth('guest-pin-jwt')
  @ApiOperation({ summary: '"J\'ai terminé" — gèle ce PDV (lecture seule), sans clôturer la fenêtre' })
  async submit(@CurrentUser() user: GuestPinUser) {
    return this.service.submitCount(user);
  }
}
