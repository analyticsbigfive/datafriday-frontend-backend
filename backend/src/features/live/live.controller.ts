import { Controller, Sse, Inject, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import type Redis from 'ioredis';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { REDIS_CLIENT } from '../../core/redis/redis.module';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { liveTenantSpacePattern } from '../../shared/live-channel.util';

/**
 * Chantier 379 (frontend/docs/chantiers/379_live_standalone_backend_driven) — indicateur
 * global "un event est live quelque part" (App.vue, monté une fois par session, survit à la
 * navigation inter-routes — même pattern que SyncJobFloatingWidget). Distinct de
 * SpacesController::liveStream (un espace précis) : ici un seul flux couvre TOUS les espaces
 * du tenant via un `psubscribe` (pattern Redis), pas une connexion par espace.
 *
 * Filtre par accès utilisateur (pas juste par tenant) : un utilisateur à accès restreint ne
 * doit pas voir "live" pour un espace qu'il ne peut pas ouvrir — resolu une fois à la
 * connexion (SpaceAccessService.getAccessibleSpaceIds), pas re-vérifié par message (l'accès
 * espace ne change pas en cours de connexion dans l'usage réel).
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
  @RequirePermissions('front.fb.live')
  @ApiOperation({
    summary: 'Flux SSE global — un event vient de passer live quelque part dans le tenant',
    description:
      'Un événement "message" ({ spaceId, at }) par agrégation terminée, tous espaces ' +
      'accessibles à l\'utilisateur confondus — aucune donnée métier, juste un signal. ' +
      '+ un "heartbeat" toutes les 20s.',
  })
  liveStream(@CurrentUser() user: any): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let sub: Redis | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let closed = false;

      (async () => {
        const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
        if (closed) return;
        const allowedSet = accessible === 'ALL' ? null : new Set(accessible);

        sub = this.redisClient.duplicate();
        const pattern = liveTenantSpacePattern(user.tenantId);
        await sub.psubscribe(pattern);
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
