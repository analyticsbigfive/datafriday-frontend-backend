import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import type { CurrentUserData } from '../../core/auth/decorators/current-user.decorator';
import { VentilationAccessService } from './ventilation-access.service';
import { VentilationSelectionDto, VentilationWindowDto } from './dto/ventilation.dto';

/**
 * Accès PIN « Ventilation » de l'écran Logistique : PIN de la sélection de matchs
 * (`ensure`, une par combinaison), arrêter / reprendre un accès, changer le PIN, relire le QR et le PIN.
 * Même droit que l'écran Logistique (pas le droit de gestion des PIN d'inventaire).
 */
@ApiTags('Ventilation : accès logisticiens')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@RequirePermissions('front.fb.logistic')
@Controller('ventilation-access')
export class VentilationAdminController {
  constructor(private readonly service: VentilationAccessService) {}

  @Post('ensure')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'PIN de la combinaison de matchs : crée et ouvre son accès si besoin (PIN prédéfini) ; ' +
      'la même combinaison retrouve toujours le même accès',
  })
  async ensure(@Body() dto: VentilationSelectionDto, @CurrentUser() user: CurrentUserData) {
    return this.service.ensure(dto, user);
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reprend un accès ventilation arrêté (même PIN)" })
  async start(@Body() dto: VentilationWindowDto, @CurrentUser() user: CurrentUserData) {
    return this.service.start(dto, user);
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Arrête un accès ventilation (PIN conservé pour une reprise)" })
  async stop(@Body() dto: VentilationWindowDto, @CurrentUser() user: CurrentUserData) {
    return this.service.stop(dto, user);
  }

  @Post('reset-pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Génère un nouveau PIN (l'ancien ne permet plus de se connecter)" })
  async resetPin(@Body() dto: VentilationWindowDto, @CurrentUser() user: CurrentUserData) {
    return this.service.resetPin(dto, user);
  }
}
