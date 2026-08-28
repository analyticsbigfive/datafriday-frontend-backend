import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Notifications persistées serveur (décision Bertrand 08/2026 : in-app d'abord, WhatsApp
 * en option plus tard). Toujours scopées (tenantId, userId), un utilisateur ne voit
 * jamais les notifications d'un autre, même dans le même tenant. Écrites ailleurs
 * (ex. LogisticTasksService.createBatch) via `prisma.notification.create(Many)`
 * directement : ce service ne porte que la LECTURE (liste + marquer lu).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── GET /notifications ───────────────────────────────────────────────────────

  async listForUser(tenantId: string, userId: string) {
    return this.prisma.notification.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ─── PATCH /notifications/:id/read ────────────────────────────────────────────

  async markRead(id: string, tenantId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, tenantId, userId } });
    if (!notification) throw new NotFoundException(`Notification ${id} not found`);
    if (notification.read) return notification;
    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  // ─── PATCH /notifications/read-all ────────────────────────────────────────────

  async markAllRead(tenantId: string, userId: string) {
    if (!tenantId || !userId) throw new BadRequestException('tenantId/userId requis');
    const { count } = await this.prisma.notification.updateMany({
      where: { tenantId, userId, read: false },
      data: { read: true },
    });
    return { count };
  }
}
