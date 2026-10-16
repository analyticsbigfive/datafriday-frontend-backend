import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/payment-method.dto';
import { PaymentMethodsService } from './payment-methods.service';

/** Lecture ouverte aux utilisateurs du tenant, écriture sous `menu.config.manage` (comme promotion-types). */
@ApiTags('Payment Methods')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les moyens de paiement du tenant (Espèces et Carte créés à la demande)' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Post()
  @ApiOperation({ summary: 'Créer un moyen de paiement' })
  create(@Body() dto: CreatePaymentMethodDto, @CurrentTenant() tenantId: string) {
    return this.service.create(dto, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un moyen de paiement' })
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.service.findOne(id, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un moyen de paiement (nom, catégorie, actif, ordre)' })
  update(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto, @CurrentTenant() tenantId: string) {
    return this.service.update(id, dto, tenantId);
  }

  @RequirePermissions('menu.config.manage')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un moyen de paiement (un moyen système se désactive seulement)' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.service.remove(id, tenantId);
  }
}
