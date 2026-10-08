import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../../core/auth/decorators/current-user.decorator';
import { VentilationAccessService } from './ventilation-access.service';
import { VentilationTargetDto } from './dto/ventilation.dto';

/**
 * Bouton QR « Ventilation » de l'écran Logistique : démarrer / arrêter l'accès PIN
 * des logisticiens pour un match, changer le PIN, relire le QR et le PIN.
 * Même droit que l'écran Logistique (pas le droit de gestion des PIN d'inventaire).
 */
@ApiTags('Ventilation : accès logisticiens')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.logistic')
@Controller('ventilation-access')
export class VentilationAdminController {
  constructor(private readonly service: VentilationAccessService) {}

  @Get('spaces/:spaceId')
  @ApiOperation({ summary: "Slug du QR de l'espace et état de l'accès du match (PIN si ouvert)" })
  @ApiQuery({ name: 'eventId', required: false })
  async status(@Param('spaceId') spaceId: string, @Query('eventId') eventId: string, @CurrentUser() user: CurrentUserData) {
    return this.service.getStatus(spaceId, eventId, user);
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Démarre (ou reprend) l'accès ventilation du match ; ferme celui d'un autre match" })
  async start(@Body() dto: VentilationTargetDto, @CurrentUser() user: CurrentUserData) {
    return this.service.start(dto, user);
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Arrête l'accès ventilation du match (PIN conservé pour une reprise)" })
  async stop(@Body() dto: VentilationTargetDto, @CurrentUser() user: CurrentUserData) {
    return this.service.stop(dto, user);
  }

  @Post('reset-pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Génère un nouveau PIN (l'ancien ne permet plus de se connecter)" })
  async resetPin(@Body() dto: VentilationTargetDto, @CurrentUser() user: CurrentUserData) {
    return this.service.resetPin(dto, user);
  }
}
