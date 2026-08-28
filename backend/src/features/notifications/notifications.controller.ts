import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser, CurrentUserData } from '../../core/auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "Notifications de l'utilisateur connecté (50 plus récentes), pour la cloche (NotificationBell)." })
  async list(@CurrentUser() user: CurrentUserData) {
    return this.service.listForUser(user.tenantId, user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marque une notification lue (clic sur une ligne dans la cloche).' })
  @ApiParam({ name: 'id', description: 'ID de la Notification' })
  async markRead(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.markRead(id, user.tenantId, user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marque toutes les notifications lues ("Tout marquer lu" dans la cloche).' })
  async markAllRead(@CurrentUser() user: CurrentUserData) {
    return this.service.markAllRead(user.tenantId, user.id);
  }
}
