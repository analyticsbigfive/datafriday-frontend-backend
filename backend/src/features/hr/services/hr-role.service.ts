import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { HR_CONTRACT_TYPES, HR_RATE_TYPES, HR_RATE_REQUIRED_CONTRACTS } from '../hr.constants';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * Postes RH : lecture, création, modification et suppression, avec contrôle du périmètre des prestataires.
 */
@Injectable()
export class HrRoleService {
  constructor(
    private prisma: PrismaService,
    private spaceAccess: SpaceAccessService,
  ) {}

  /**
   * `accessibleSupplierIds` : quand fourni (utilisateur restreint), les agences non
   * accessibles sont retirées de `supplierIds` — sans ça, la liste des agences associées à
   * un rôle (et donc leur staff) fuitait pour des agences ne desservant pas l'espace de
   * l'utilisateur (cf. HrSuppliersService : sans site déclaré = accessible à personne).
   */
  private mapRole(r: any, accessibleSupplierIds?: 'ALL' | Set<string>) {
    const allSupplierIds = (r.suppliers ?? []).map((x: any) => x.supplierId);
    return {
      id: r.id,
      department: r.department,
      name: r.name,
      contractType: r.contractType,
      rateType: r.rateType,
      rate: r.rate,
      fnbCategories: r.fnbCategories ?? [],
      algoKey: r.algoKey,
      supplierIds:
        !accessibleSupplierIds || accessibleSupplierIds === 'ALL'
          ? allSupplierIds
          : allSupplierIds.filter((id: string) => (accessibleSupplierIds as Set<string>).has(id)),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  /** Ids des HrSupplier desservant un espace accessible à `user` (cf. mapRole). */
  private async accessibleSupplierIds(tenantId: string, user?: SpaceScopedUser): Promise<'ALL' | Set<string>> {
    if (!user || this.spaceAccess.hasFullAccess(user)) return 'ALL';
    const accessible = await this.spaceAccess.getAccessibleSpaceIds(user);
    if (accessible === 'ALL') return 'ALL';
    const rows = await this.prisma.hrSupplier.findMany({
      where: { tenantId, spaceIds: { hasSome: accessible } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Lève 403 pour un rôle AGENCE dont plus aucun fournisseur n'est accessible à `user`
   * (cf. findAllRoles) — protège aussi update/remove en accès direct par id, pas seulement
   * la liste. Un rôle interne (non AGENCE) n'a pas cette restriction.
   */
  private assertRoleVisible(
    role: { contractType: string | null; suppliers?: { supplierId: string }[] },
    accessibleSupplierIds: 'ALL' | Set<string>,
  ) {
    if (accessibleSupplierIds === 'ALL' || role.contractType !== 'AGENCY') return;
    const supplierIds = (role.suppliers ?? []).map((s) => s.supplierId);
    const hasAccessible = supplierIds.some((id) => accessibleSupplierIds.has(id));
    if (!hasAccessible) {
      throw new ForbiddenException("Ce rôle n'a aucune agence accessible — réservé aux comptes à accès complet.");
    }
  }

  // CFG-2 Étape 4.5 (généralisée le 2026-07-31) : `fnbCategories`/`fnbCategory` (HrRole,
  // HrSinkingRule) valident désormais leur existence contre le référentiel global Subtype —
  // scopé au DÉPARTEMENT DU RÔLE (`departmentId`), pas figé sur `shop`. Un rôle Hospitality ne
  // peut être tagué qu'avec les sous-types d'Hospitality (`lodges`/`salon`), un rôle F&B qu'avec
  // ceux de `shop`, etc. — même idiome de canonicalisation `code ?? id` que `normalizeRole()`
  // pour `department`. Retour utilisateur (2026-07-31) : le choix du département doit piloter
  // quel sous-type on peut lier, pas rester câblé sur F&B pour tout le monde.
  async resolveFnbCategories(values: string[], departmentId: string): Promise<string[]> {
    if (values.length === 0) return [];
    const rows = await this.prisma.subtype.findMany({
      where: { departmentId, OR: values.map((v) => ({ OR: [{ code: v }, { id: v }] })) },
    });
    return values.map((v) => {
      const row = rows.find((r) => r.code === v || r.id === v);
      if (!row) throw new BadRequestException(`fnbCategory invalide : ${v}`);
      return row.code ?? row.id;
    });
  }

  // ── Roles (validation conditionnelle, spec §2.1) ───────────────────────────

  /**
   * Normalise + valide un rôle selon la logique conditionnelle du drawer :
   * - contractType requis seulement si department = F&B (sinon remis à null) ;
   * - rateType + rate requis si contractType ∈ {CDD, AGENCY, FREELANCE} (sinon null) ;
   * - suppliers (agences) requis si contractType = AGENCY (sinon jointure vidée).
   * Les champs masqués côté UI sont donc bien remis à null à la sauvegarde.
   */
  private async normalizeRole(input: any, tenantId: string, existing?: any) {
    const rawDepartment = input.department ?? existing?.department;
    // CFG-2 Étape 4 : existence contre Department (global, filtré needsRh — un rôle RH n'a de
    // sens que pour un département qui a du staffing), plutôt que la liste HR_DEPARTMENTS figée.
    const departmentRow = await this.prisma.department.findFirst({
      where: { needsRh: true, OR: [{ code: rawDepartment }, { id: rawDepartment }] },
    });
    if (!departmentRow) {
      throw new BadRequestException(`department invalide : ${rawDepartment}`);
    }
    // Canonicalise vers `code ?? id`, quelle que soit la forme envoyée par l'appelant (code ou
    // id) — garantit que la valeur SAUVEGARDÉE est toujours stable, jamais le libellé.
    const department = departmentRow.code ?? departmentRow.id;
    const name = (input.name ?? existing?.name ?? '').trim();
    if (!name) throw new BadRequestException('Le nom du rôle est requis.');

    let contractType = input.contractType !== undefined ? input.contractType : (existing?.contractType ?? null);
    let rateType = input.rateType !== undefined ? input.rateType : (existing?.rateType ?? null);
    let rate = input.rate !== undefined ? input.rate : (existing?.rate ?? null);
    let supplierIds: string[] =
      input.supplierIds !== undefined
        ? (input.supplierIds ?? [])
        : ((existing?.suppliers ?? []).map((x: any) => x.supplierId) as string[]);
    const fnbCategories = await this.resolveFnbCategories(
      input.fnbCategories !== undefined ? (input.fnbCategories ?? []) : (existing?.fnbCategories ?? []),
      departmentRow.id,
    );
    const algoKey = input.algoKey !== undefined ? (input.algoKey || null) : (existing?.algoKey ?? null);

    // 'shop' = code STABLE du département F&B (Department.code, jamais affecté par un
    // renommage de Department.name — même raison que StorageType.code/SpaceElement.type).
    // Comparé sur `departmentRow.code` (résolu ci-dessus), pas sur `department` brut : couvre
    // aussi bien le cas où l'appelant a passé le code que l'id.
    if (departmentRow.code !== 'shop') {
      contractType = null;
    } else if (!contractType || !HR_CONTRACT_TYPES.includes(contractType)) {
      throw new BadRequestException('contractType est requis pour un rôle F&B.');
    }

    if (contractType && (HR_RATE_REQUIRED_CONTRACTS as readonly string[]).includes(contractType)) {
      if (!rateType || !HR_RATE_TYPES.includes(rateType)) {
        throw new BadRequestException(`rateType est requis pour un contrat ${contractType}.`);
      }
      if (rate === null || rate === undefined || Number(rate) < 0) {
        throw new BadRequestException(`rate est requis pour un contrat ${contractType}.`);
      }
    } else {
      rateType = null;
      rate = null;
    }

    if (contractType === 'AGENCY') {
      supplierIds = Array.from(new Set(supplierIds.filter(Boolean)));
      if (supplierIds.length === 0) {
        throw new BadRequestException('Au moins une agence (supplier) est requise pour un contrat AGENCY.');
      }
      const found = await this.prisma.hrSupplier.findMany({
        where: { id: { in: supplierIds }, tenantId },
        select: { id: true, name: true, departments: true },
      });
      if (found.length !== supplierIds.length) {
        throw new BadRequestException('Une ou plusieurs agences sélectionnées sont introuvables.');
      }
      // BUG-266-02 : le frontend filtre déjà les agences proposées par département, mais rien ne
      // l'imposait côté backend — un appel API direct pouvait lier une agence hors département.
      const ineligible = found.find((s) => !(s.departments ?? []).includes(department));
      if (ineligible) {
        throw new BadRequestException(
          `L'agence « ${ineligible.name} » ne couvre pas le département « ${department} ».`,
        );
      }
    } else {
      supplierIds = [];
    }

    return { department, name, contractType, rateType, rate, supplierIds, fnbCategories, algoKey };
  }

  async findAllRoles(tenantId: string, user?: SpaceScopedUser) {
    const rows = await this.prisma.hrRole.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: { suppliers: { select: { supplierId: true } } },
    });
    const accessibleSupplierIds = await this.accessibleSupplierIds(tenantId, user);
    const mapped = rows.map((r) => this.mapRole(r, accessibleSupplierIds));
    // Un rôle interne (CDI/CDD/FREELANCE/OTHER, sans fournisseur requis) reste un
    // référentiel tenant-wide visible par tous. Un rôle AGENCE dont plus aucun fournisseur
    // n'est accessible est en revanche masqué pour un utilisateur restreint — sinon il
    // resterait listé avec une liste de fournisseurs vide, comme si aucune agence n'était
    // configurée alors qu'il y en a, simplement hors de son périmètre.
    const visible =
      accessibleSupplierIds === 'ALL'
        ? mapped
        : mapped.filter((r) => r.contractType !== 'AGENCY' || r.supplierIds.length > 0);
    return { data: visible };
  }

  async createRole(input: any, tenantId: string, user?: SpaceScopedUser) {
    const n = await this.normalizeRole(input, tenantId);
    try {
      const row = await this.prisma.hrRole.create({
        data: {
          tenantId,
          department: n.department,
          name: n.name,
          contractType: n.contractType,
          rateType: n.rateType,
          rate: n.rate,
          fnbCategories: n.fnbCategories,
          algoKey: n.algoKey,
          suppliers: { create: n.supplierIds.map((supplierId) => ({ supplierId })) },
        },
        include: { suppliers: { select: { supplierId: true } } },
      });
      return this.mapRole(row, await this.accessibleSupplierIds(tenantId, user));
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`Un rôle RH nommé « ${n.name} » existe déjà.`);
      }
      throw error;
    }
  }

  async updateRole(id: string, input: any, tenantId: string, user?: SpaceScopedUser) {
    const existing = await this.prisma.hrRole.findFirst({
      where: { id, tenantId },
      include: { suppliers: { select: { supplierId: true } } },
    });
    if (!existing) throw new NotFoundException(`HrRole ${id} introuvable`);
    const accessibleSupplierIds = await this.accessibleSupplierIds(tenantId, user);
    this.assertRoleVisible(existing, accessibleSupplierIds);
    const n = await this.normalizeRole(input, tenantId, existing);

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.hrRoleSupplier.deleteMany({ where: { roleId: id } });
      return tx.hrRole.update({
        where: { id },
        data: {
          department: n.department,
          name: n.name,
          contractType: n.contractType,
          rateType: n.rateType,
          rate: n.rate,
          fnbCategories: n.fnbCategories,
          algoKey: n.algoKey,
          suppliers: { create: n.supplierIds.map((supplierId) => ({ supplierId })) },
        },
        include: { suppliers: { select: { supplierId: true } } },
      });
    });
    return this.mapRole(row, accessibleSupplierIds);
  }

  async removeRole(id: string, tenantId: string, user?: SpaceScopedUser) {
    const existing = await this.prisma.hrRole.findFirst({
      where: { id, tenantId },
      include: { suppliers: { select: { supplierId: true } } },
    });
    if (!existing) throw new NotFoundException(`HrRole ${id} introuvable`);
    this.assertRoleVisible(existing, await this.accessibleSupplierIds(tenantId, user));
    await this.prisma.hrRole.delete({ where: { id } }); // cascade jointures + persons
    return { deleted: true };
  }
}
