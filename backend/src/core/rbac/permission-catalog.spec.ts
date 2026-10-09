import { SYSTEM_PERMISSIONS, SYSTEM_ROLES, ensureSystemPermissionCatalog } from './permission-catalog';

/** Client simulé : une table de permissions système, des rôles, et les attributions créées. */
function fakeClient(existingCodes: string[], roles: Array<{ id: string; name: string }>) {
  // Comme en base : description/catégorie absentes = null.
  const perms = SYSTEM_PERMISSIONS.filter((p) => existingCodes.includes(p.code)).map((p, i) => ({
    id: `p${i}`, code: p.code, name: p.name, description: p.description ?? null, category: p.category ?? null,
  }));
  let next = perms.length;
  const client = {
    permission: {
      findMany: jest.fn(async ({ where }: any) => perms.filter((p) => where.code.in.includes(p.code))),
      createMany: jest.fn(async ({ data }: any) => {
        for (const d of data) perms.push({ id: `p${next++}`, ...d });
        return { count: data.length };
      }),
      update: jest.fn(),
    },
    role: { findMany: jest.fn(async ({ where }: any) => roles.filter((r) => where.name.in.includes(r.name))) },
    rolePermission: { createMany: jest.fn(async ({ data }: any) => ({ count: data.length })) },
  };
  return { client, perms };
}

describe('ensureSystemPermissionCatalog (lectures et écritures groupées)', () => {
  const allCodes = SYSTEM_PERMISSIONS.map((p) => p.code);

  it('catalogue à jour : une seule lecture, aucune écriture', async () => {
    const { client } = fakeClient(allCodes, []);
    const ids = await ensureSystemPermissionCatalog(client as any);
    expect(Object.keys(ids).sort()).toEqual([...allCodes].sort());
    expect(client.permission.findMany).toHaveBeenCalledTimes(1);
    expect(client.permission.createMany).not.toHaveBeenCalled();
    expect(client.permission.update).not.toHaveBeenCalled();
    expect(client.rolePermission.createMany).not.toHaveBeenCalled();
  });

  it('codes manquants : créés en une fois, accordés en une fois aux rôles système qui les prévoient', async () => {
    const missing = ['front.fb.guestPinManage', 'stats.financial.view'];
    const chef = SYSTEM_ROLES.find((r) => r.name === 'Chef')!;
    const { client } = fakeClient(allCodes.filter((c) => !missing.includes(c)), [
      { id: 'chef-t1', name: 'Chef' },
      { id: 'chef-t2', name: 'Chef' },
    ]);
    const ids = await ensureSystemPermissionCatalog(client as any);
    expect(client.permission.createMany).toHaveBeenCalledTimes(1);
    expect(client.permission.createMany.mock.calls[0][0].data.map((d: any) => d.code).sort()).toEqual(missing);
    expect(client.rolePermission.createMany).toHaveBeenCalledTimes(1);
    const granted = client.rolePermission.createMany.mock.calls[0][0];
    expect(granted.skipDuplicates).toBe(true);
    const expectedForChef = missing.filter((c) => chef.permissions.includes(c)).map((c) => ids[c]);
    expect(granted.data).toEqual(
      expect.arrayContaining(['chef-t1', 'chef-t2'].flatMap((roleId) => expectedForChef.map((permissionId) => ({ roleId, permissionId })))),
    );
  });

  it('métadonnées modifiées dans le code : seule la permission concernée est mise à jour', async () => {
    const { client, perms } = fakeClient(allCodes, []);
    perms[0].name = 'Ancien libellé';
    await ensureSystemPermissionCatalog(client as any);
    expect(client.permission.update).toHaveBeenCalledTimes(1);
    expect(client.permission.update.mock.calls[0][0].where).toEqual({ id: perms[0].id });
  });
});
