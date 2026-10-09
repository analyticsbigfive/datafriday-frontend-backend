import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationPublisherService } from './notification-publisher.service';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationPublisherService],
  // Signal « nouvelle notification » publié par les modules qui en créent (logistic-tasks).
  exports: [NotificationPublisherService],
})
export class NotificationsModule {}
