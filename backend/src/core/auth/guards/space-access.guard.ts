import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SPACE_ID_PARAM_KEY } from '../decorators/space-id-param.decorator';
import { SpaceAccessService } from '../space-access.service';

/**
 * Defense-in-depth : sur toute requête portant un id d'espace précis — en route param
 * (`:spaceId` par défaut, ou le nom déclaré via `@SpaceIdParam(...)`), en query string
 * (`?spaceId=`) ou dans le body (`{ spaceId }`) — refuse l'accès si l'utilisateur n'a
 * pas le périmètre requis (cf. SpaceAccessService). Les trois sources sont vérifiées
 * (params puis query puis body) car de nombreux endpoints de filtrage/agrégation
 * (`GET /analyse/dashboard?spaceId=`, `GET /events?spaceId=`, mutations avec
 * `{ spaceId }` en body, etc.) identifient l'espace hors de l'URL — un simple contrôle
 * sur `:spaceId` les laissait passer sans aucune vérification.
 *
 * - Aucune des trois sources ne porte de spaceId → laissé passer (le filtrage par
 *   défaut des LISTES quand aucun espace n'est demandé est fait séparément dans les
 *   services, via `SpaceAccessService.getAccessibleSpaceIds`).
 * - Utilisateurs à accès complet (ADMIN owner / super-admin / `allSpacesAccess`) → aucun coût DB.
 *
 * Enregistré globalement APRÈS JwtDatabaseGuard (request.user peuplé).
 */
@Injectable()
export class SpaceAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return true; // l'auth est gérée par les guards en amont

    const paramName =
      this.reflector.getAllAndOverride<string>(SPACE_ID_PARAM_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'spaceId';

    const spaceId =
      request.params?.[paramName] ?? request.query?.[paramName] ?? request.body?.[paramName];
    if (!spaceId || typeof spaceId !== 'string') return true; // requête non rattachée à un espace précis

    // Court-circuit sans DB pour les accès complets.
    if (this.spaceAccess.hasFullAccess(user)) return true;

    const allowed = await this.spaceAccess.canAccessSpace(user, spaceId);
    if (!allowed) {
      throw new ForbiddenException("Vous n'avez pas accès à cet espace.");
    }
    return true;
  }
}
