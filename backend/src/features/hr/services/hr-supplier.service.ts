import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * RH staffing — fournisseurs (agences), rôles métier (« positions ») et
 * personnes internes. Migre les données localStorage du frontend
 * (utils/hrApi.js : hr_suppliers / staff_positions) via l'import one-shot.
 * ⚠️ Sans rapport avec features/roles/ (permissions utilisateurs).
 * tenantId auto-scopé par PrismaService ; on filtre quand même explicitement
 * (défense en profondeur, cf. hr-settings.service.ts).
 */



const ASSERT_SPACE_WRITE_ACCESS_MESSAGES = {
  none: "Cette ressource ne dessert aucun espace — réservée aux comptes à accès complet.",
  denied: "Vous n'avez pas accès à l'espace de cette ressource.",
};

/**
 * Prestataires RH : lecture, création, modification, suppression et import initial depuis le navigateur.
 */
@Injectable()
export class HrSupplierService {
  constructor(
    private prisma: PrismaService,
    private spaceAccess: SpaceAccessService,
  ) {}

  // ── Mapping ────────────────────────────────────────────────────────────────

  private mapSupplier(s: any) {
    return {
      id: s.id,
      name: s.name,
      contact: s.contact,
      email: s.email,
      tel: s.tel,
      picture: s.picture,
      departments: s.departments ?? [],
      spaceIds: s.spaceIds ?? [],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  // CFG-2 Étape 4 : `HrSupplier.departments` n'avait ZÉRO validation avant ce changement (ni DTO
  // ni service) — le frontend restreignait la saisie via HR_SUPPLIER_DEPARTMENTS (liste figée,
  // frontend uniquement), mais l'API acceptait n'importe quelle chaîne. Ajout d'une existence
  // contre Department (filtré allowsSuppliers), canonicalisation vers `code ?? id` — même idiome
  // que normalizeRole(). C'est une VALIDATION NOUVELLE (pas la préservation d'un comportement
  // existant) : aucune ligne actuelle ne devrait la violer (audit CFG-2 Étape 0 : 0 valeur en
  // base), mais à surveiller si un import/écriture directe a pu introduire des valeurs hors
  // référentiel depuis.
  private async normalizeSupplierDepartments(departments: string[] | undefined): Promise<string[] | undefined> {
    if (departments === undefined) return undefined;
    if (departments.length === 0) return [];
    const rows = await this.prisma.department.findMany({
      where: { allowsSuppliers: true, OR: departments.map((d) => ({ OR: [{ code: d }, { id: d }] })) },
    });
    const resolved: string[] = [];
    for (const d of departments) {
      const row = rows.find((r) => r.code === d || r.id === d);
      if (!row) throw new BadRequestException(`department invalide pour un fournisseur : ${d}`);
      resolved.push(row.code ?? row.id);
    }
    return resolved;
  }

  async findAllSuppliers(tenantId: string, user?: SpaceScopedUser) {
    // Un utilisateur restreint à certains espaces ne doit voir que les fournisseurs RH qui y
    // sont déclarés — un fournisseur sans espace déclaré ne dessert aucun espace accessible
    // par construction, jamais « tout le tenant » pour un compte restreint.
    const where: any = { tenantId };
    if (user && !this.spaceAccess.hasFullAccess(user)) {
      const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
      if (accessible !== 'ALL') {
        where.spaceIds = { hasSome: accessible };
      }
    }
    const rows = await this.prisma.hrSupplier.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return { data: rows.map((s) => this.mapSupplier(s)) };
  }

  async createSupplier(
    input: {
      name: string;
      contact?: string;
      email?: string;
      tel?: string;
      picture?: string;
      departments?: string[];
      spaceIds?: string[];
    },
    tenantId: string,
  ) {
    const departments = await this.normalizeSupplierDepartments(input.departments);
    try {
      const row = await this.prisma.hrSupplier.create({
        data: {
          tenantId,
          name: input.name.trim(),
          contact: input.contact ?? null,
          email: input.email ?? null,
          tel: input.tel ?? null,
          picture: input.picture ?? null,
          departments: departments ?? [],
          spaceIds: input.spaceIds ?? [],
        },
      });
      return this.mapSupplier(row);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`Un fournisseur RH nommé « ${input.name} » existe déjà.`);
      }
      throw error;
    }
  }

  async updateSupplier(id: string, input: any, tenantId: string, user?: SpaceScopedUser) {
    const existing = await this.prisma.hrSupplier.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrSupplier ${id} introuvable`);
    await this.spaceAccess.assertCanAccessAny(user, existing.spaceIds, ASSERT_SPACE_WRITE_ACCESS_MESSAGES);
    const departments = await this.normalizeSupplierDepartments(input.departments);
    try {
      const row = await this.prisma.hrSupplier.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: String(input.name).trim() }),
          ...(input.contact !== undefined && { contact: input.contact }),
          ...(input.email !== undefined && { email: input.email }),
          ...(input.tel !== undefined && { tel: input.tel }),
          ...(input.picture !== undefined && { picture: input.picture }),
          ...(departments !== undefined && { departments }),
          ...(input.spaceIds !== undefined && { spaceIds: input.spaceIds }),
        },
      });
      return this.mapSupplier(row);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`Un fournisseur RH nommé « ${input.name} » existe déjà.`);
      }
      throw error;
    }
  }

  async removeSupplier(id: string, tenantId: string, user?: SpaceScopedUser) {
    const existing = await this.prisma.hrSupplier.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrSupplier ${id} introuvable`);
    await this.spaceAccess.assertCanAccessAny(user, existing.spaceIds, ASSERT_SPACE_WRITE_ACCESS_MESSAGES);
    await this.prisma.hrSupplier.delete({ where: { id } }); // cascade jointures
    return { deleted: true };
  }

  // ── Import one-shot localStorage → BD ──────────────────────────────────────

  /**
   * Import unique des données localStorage du frontend (hr_suppliers /
   * staff_positions). Refusé si le tenant possède déjà des données RH — le
   * frontend purge ensuite ses clés localStorage (spec §1.4).
   * Mapping best-effort : une « position » legacy (nom + agence + taux horaire)
   * devient un HrRole AGENCY / HOURLY rattaché à l'agence importée.
   */
  async importFromLocalStorage(
    payload: { suppliers?: any[]; positions?: any[] },
    tenantId: string,
  ) {
    const [supCount, roleCount] = await this.prisma.$transaction([
      this.prisma.hrSupplier.count({ where: { tenantId } }),
      this.prisma.hrRole.count({ where: { tenantId } }),
    ]);
    if (supCount > 0 || roleCount > 0) {
      throw new BadRequestException(
        'Import refusé : des données RH existent déjà en base pour ce tenant.',
      );
    }

    const suppliers = payload.suppliers ?? [];
    const positions = payload.positions ?? [];
    const legacyIdToDbId = new Map<string, string>();

    let importedSuppliers = 0;
    for (const s of suppliers) {
      if (!s?.name) continue;
      // eslint-disable-next-line no-await-in-loop -- import initial ponctuel, l'ordre détermine la résolution des doublons de nom
      const row = await this.prisma.hrSupplier.create({
        data: {
          tenantId,
          name: String(s.name).trim(),
          contact: s.contactName ?? s.contact ?? null,
          email: s.email ?? null,
          tel: s.phone ?? s.tel ?? null,
          picture: s.picture ?? null,
          departments: Array.isArray(s.departments ?? s.sectors) ? (s.departments ?? s.sectors) : [],
          spaceIds: Array.isArray(s.spaces) ? s.spaces : [],
        },
      });
      if (s.id) legacyIdToDbId.set(String(s.id), row.id);
      importedSuppliers++;
    }

    // CFG-2 Étape 4 : `p.sector` est un libellé legacy libre (ex-HR_DEPARTMENTS) — résolu par nom
    // (insensible à la casse) contre Department (filtré needsRh, mêmes départements que
    // normalizeRole()), repli sur 'shop' (code stable du département F&B) si non reconnu, comme
    // avant ce changement (repli déjà 'F&B').
    const importDeptRows = positions.length ? await this.prisma.department.findMany({ where: { needsRh: true } }) : [];
    let importedRoles = 0;
    for (const p of positions) {
      const name = (p?.positionName ?? p?.name ?? '').trim();
      if (!name) continue;
      const dbSupplierId = p.supplierId ? legacyIdToDbId.get(String(p.supplierId)) : undefined;
      const matchedDept = importDeptRows.find((d) => d.name.toLowerCase() === String(p.sector || '').toLowerCase());
      const department = matchedDept ? (matchedDept.code ?? matchedDept.id) : 'shop';
      const rate = Number(p.ratePerHour ?? p.rate);
      const data = (roleName: string) => ({
        tenantId,
        department,
        name: roleName,
        contractType: dbSupplierId ? 'AGENCY' : 'OTHER',
        rateType: Number.isFinite(rate) ? 'HOURLY' : null,
        rate: Number.isFinite(rate) ? rate : null,
        fnbCategories: [],
        algoKey: null,
        ...(dbSupplierId && { suppliers: { create: [{ supplierId: dbSupplierId }] } }),
      });
      try {
        // eslint-disable-next-line no-await-in-loop -- import initial ponctuel, l'ordre détermine la résolution des doublons de nom
        await this.prisma.hrRole.create({ data: data(name) });
      } catch (error: any) {
        // Legacy : un même nom de position pouvait exister chez plusieurs agences.
        if (error.code !== 'P2002') throw error;
        // eslint-disable-next-line no-await-in-loop -- import initial ponctuel, l'ordre détermine la résolution des doublons de nom
        await this.prisma.hrRole.create({ data: data(`${name} (${importedRoles + 1})`) });
      }
      importedRoles++;
    }

    return { importedSuppliers, importedRoles };
  }
}
