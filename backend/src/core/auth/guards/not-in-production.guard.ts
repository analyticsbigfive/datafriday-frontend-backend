import { Injectable, CanActivate, ForbiddenException } from '@nestjs/common';

/**
 * Bloque un endpoint QA-only (ex. simulation de vente Live) en production.
 *
 * `NODE_ENV` distingue déjà correctement production/staging côté backend (déploiements
 * Render séparés, cf. main.ts `isProd`) — contrairement au frontend, où le même build
 * Vue CLI vaut `production` pour staging ET production (voir VUE_APP_ENVIRONMENT côté
 * LiveView.vue pour ce cas-là). Rien ici ne dépend du tenant/de l'utilisateur.
 */
@Injectable()
export class NotInProductionGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Outil QA désactivé en production.');
    }
    return true;
  }
}
