import { Controller, Sse, Inject, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import type Redis from 'ioredis';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { REDIS_CLIENT } from '../../core/redis/redis.constants';
import { CurrentUser, CurrentUserData } from '../../core/auth/decorators/current-user.decorator';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { hasPermission } from '../../core/rbac/permission.util';
import { liveTenantSpacePattern, notificationUserChannel } from '../../shared/live-channel.util';

/**
 * Chantier 379 (frontend/docs/chantiers/379_live_standalone_backend_driven) — flux SSE global de
 * la session (App.vue, monté une fois, survit à la navigation inter-routes). Distinct de
 * SpaceAnalyticsController::liveStream (un espace précis). Deux signaux, aucune donnée métier :
 *  - `{ spaceId, at }` : un event vient de passer live quelque part dans le tenant, via un
 *    `psubscribe` (pattern Redis), filtré par accès espace et réservé à la permission
 *    `front.fb.live` (contrôlée ici, pas par le guard : le flux sert aussi les notifications) ;
 *  - `{ kind: 'notification', at }` : une notification vient d'être créée pour CET utilisateur
 *    (NotificationPublisherService) ; remplace le poll toutes les 30 s de la cloche.
 *
 * Accès espace résolu une fois à la connexion (SpaceAccessService.getAccessibleSpaceIds), pas
 * re-vérifié par message (l'accès espace ne change pas en cours de connexion dans l'usage réel).
 */
@ApiTags('Live')
@ApiBearerAuth('supabase-jwt')
@Controller('live')
export class LiveController {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  @Sse('stream')
  @ApiOperation({
    summary: 'Flux SSE global de la session : events live du tenant et notifications de l\'utilisateur',
    description:
      'Un événement "message" ({ spaceId, at }) par agrégation terminée, tous espaces ' +
      'accessibles à l\'utilisateur confondus (permission front.fb.live) ; un événement "message" ' +
      '({ kind: "notification", at }) par notification créée pour l\'utilisateur. Aucune donnée ' +
      'métier, juste un signal. + un "heartbeat" toutes les 20s.',
  })
  liveStream(@CurrentUser() user: CurrentUserData): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let sub: Redis | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let closed = false;

      (async () => {
        const canSeeLive = hasPermission(user, 'front.fb.live');
        const accessible = canSeeLive ? await this.spaceAccess.getAccessibleSpaceIds(user) : [];
        if (closed) return;
        const allowedSet = accessible === 'ALL' ? null : new Set(accessible);

        sub = this.redisClient.duplicate();
        await sub.subscribe(notificationUserChannel(user.tenantId!, user.id));
        if (canSeeLive) await sub.psubscribe(liveTenantSpacePattern(user.tenantId!));
        if (closed) {
          await sub.quit();
          return;
        }
        sub.on('pmessage', (_pattern: string, _chan: string, message: string) => {
          try {
            const payload = JSON.parse(message);
            if (allowedSet && !allowedSet.has(payload.spaceId)) return;
            subscriber.next({ data: payload });
          } catch {
            // message mal formé — ignoré, pas de crash de la connexion SSE pour ça.
          }
        });
        sub.on('message', (_chan: string, message: string) => {
          try {
            const payload = JSON.parse(message);
            subscriber.next({ data: { kind: 'notification', at: payload?.at ?? new Date().toISOString() } });
          } catch {
            // idem
          }
        });
        sub.on('error', (err) => subscriber.error(err));

        heartbeat = setInterval(() => {
          subscriber.next({ type: 'heartbeat', data: { at: new Date().toISOString() } });
        }, 20_000);
      })().catch((err) => subscriber.error(err));

      return () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (sub) sub.quit().catch(() => {});
      };
    });
  }
}
