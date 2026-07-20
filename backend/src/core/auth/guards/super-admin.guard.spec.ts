import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';

/**
 * SuperAdminGuard — protège les surfaces d'administration PLATEFORME (cross-tenant) :
 * TenantsController, MetricsController, et OrganizationsController (BUG-035).
 *
 * La décision d'accès repose uniquement sur le flag `user.isSuperAdmin` (résolu lors
 * du lookup JWT-DB) : le rôle ADMIN d'une organisation ne suffit PAS. Ces tests
 * verrouillent cette décision — c'est elle qui ferme la faille cross-tenant de
 * BUG-035 sur `/organizations/:id`.
 */
describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;

  const ctxWith = (user: any): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as any);

  beforeEach(() => {
    guard = new SuperAdminGuard();
  });

  it('autorise un super-admin plateforme', () => {
    expect(guard.canActivate(ctxWith({ id: 'u1', isSuperAdmin: true }))).toBe(true);
  });

  it('rejette (403) un ADMIN d\'organisation non super-admin', () => {
    // Rôle le plus élevé d'un tenant, mais pas super-admin : c'est le cœur de BUG-035 /
    // P0-1 — un ADMIN du tenant A ne doit PAS pouvoir administrer le tenant B.
    expect(() => guard.canActivate(ctxWith({ id: 'u1', role: 'ADMIN', isSuperAdmin: false }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejette (403) un utilisateur sans flag isSuperAdmin', () => {
    expect(() => guard.canActivate(ctxWith({ id: 'u1' }))).toThrow(ForbiddenException);
  });

  it('rejette (403) une requête sans user (défense en profondeur)', () => {
    expect(() => guard.canActivate(ctxWith(undefined))).toThrow(ForbiddenException);
  });
});
