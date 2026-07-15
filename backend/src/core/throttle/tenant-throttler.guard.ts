import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Custom throttler guard that tracks rate limits per tenant
 * instead of per IP address. This ensures fair usage across
 * multi-tenant SaaS environments.
 */
@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use tenantId from authenticated user for rate limiting
    // Falls back to IP address for unauthenticated requests
    const user = req.user;
    if (user?.tenantId) {
      return `tenant:${user.tenantId}`;
    }
    return req.ip || req.ips?.[0] || 'unknown';
  }

  // Porte `retryAfter` (secondes) jusqu'à AllExceptionsFilter, qui le traduit
  // en header Retry-After — sans ça le client (fan-out front) n'a aucun moyen
  // de savoir combien de temps attendre avant de relancer.
  protected async throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException(
      { message: 'Trop de requêtes, réessayez plus tard.', retryAfter: throttlerLimitDetail.timeToExpire },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
