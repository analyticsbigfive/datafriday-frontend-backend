import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/**
 * Guard JWT invité PIN — utilise la stratégie 'jwt-guest-pin'.
 * Appliqué localement (@UseGuards) sur les contrôleurs invité, en plus de
 * @Public() qui neutralise les guards globaux staff (JwtDatabaseGuard/TenantGuard).
 */
@Injectable()
export class JwtGuestPinGuard extends AuthGuard('jwt-guest-pin') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }
}
