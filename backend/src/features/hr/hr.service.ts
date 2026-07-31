import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * RH staffing — fournisseurs (agences), rôles métier (« positions ») et
 * personnes internes. Migre les données localStorage du frontend
 * (utils/hrApi.js : hr_suppliers / staff_positions) via l'import one-shot.
 * ⚠️ Sans rapport avec features/roles/ (permissions utilisateurs).
 * tenantId auto-scopé par PrismaService ; on filtre quand même explicitement
 * (défense en profondeur, cf. hr-settings.service.ts).
 */

// CFG-2 Étape 4 : HR_DEPARTMENTS (liste figée) retiré — HrRole.department valide désormais son
// existence contre la table globale `Department` (filtrée `needsRh: true`, cf. normalizeRole()
// ci-dessous), et stocke `code ?? id` plutôt que le libellé (même idiome que SpaceElement.type).
export const HR_CONTRACT_TYPES = ['CDD', 'FREELANCE', 'CDI', 'AGENCY', 'OTHER'] as const;
export const HR_RATE_TYPES = ['HOURLY', 'DAILY', 'MONTHLY'] as const;
export const HR_PERSON_CONTRACTS = ['CDI', 'CDD'] as const;
/** Contract types pour lesquels rateType + rate sont requis (spec §2.1). */
export const HR_RATE_REQUIRED_CONTRACTS = ['CDD', 'AGENCY', 'FREELANCE'] as const;

@Injectable()
export class HrService {
  constructor(private prisma: PrismaService) {}

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

  private mapRole(r: any) {
    return {
      id: r.id,
      department: r.department,
      name: r.name,
      contractType: r.contractType,
      rateType: r.rateType,
      rate: r.rate,
      fnbCategories: r.fnbCategories ?? [],
      algoKey: r.algoKey,
      supplierIds: (r.suppliers ?? []).map((x: any) => x.supplierId),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private mapPerson(p: any) {
    return {
      id: p.id,
      roleId: p.roleId,
      firstName: p.firstName,
      lastName: p.lastName,
      contractType: p.contractType,
      hourlyRate: p.hourlyRate,
      active: p.active,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
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

  // CFG-2 Étape 4.5 : `fnbCategories`/`fnbCategory` (HrRole, HrSinkingRule) valident désormais
  // leur existence contre le référentiel global Subtype (département `shop`) et se canonicalisent
  // vers `code ?? id` — même idiome que `normalizeRole()` pour `department`. Un sous-type F&B créé
  // par le super-admin devient utilisable dans les rôles/règles Sinking sans changement de code
  // (plus de vocabulaire HR_FNB_CATEGORIES séparé ni de table de correspondance, cf. fnb-tags.util.ts).
  private async resolveFnbCategories(values: string[]): Promise<string[]> {
    if (values.length === 0) return [];
    const rows = await this.prisma.subtype.findMany({
      where: { department: { code: 'shop' }, OR: values.map((v) => ({ OR: [{ code: v }, { id: v }] })) },
    });
    return values.map((v) => {
      const row = rows.find((r) => r.code === v || r.id === v);
      if (!row) throw new BadRequestException(`fnbCategory invalide : ${v}`);
      return row.code ?? row.id;
    });
  }

  async findAllSuppliers(tenantId: string) {
    const rows = await this.prisma.hrSupplier.findMany({
      where: { tenantId },
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

  async updateSupplier(id: string, input: any, tenantId: string) {
    const existing = await this.prisma.hrSupplier.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrSupplier ${id} introuvable`);
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

  async removeSupplier(id: string, tenantId: string) {
    const existing = await this.prisma.hrSupplier.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrSupplier ${id} introuvable`);
    await this.prisma.hrSupplier.delete({ where: { id } }); // cascade jointures
    return { deleted: true };
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
        select: { id: true },
      });
      if (found.length !== supplierIds.length) {
        throw new BadRequestException('Une ou plusieurs agences sélectionnées sont introuvables.');
      }
    } else {
      supplierIds = [];
    }

    return { department, name, contractType, rateType, rate, supplierIds, fnbCategories, algoKey };
  }

  async findAllRoles(tenantId: string) {
    const rows = await this.prisma.hrRole.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: { suppliers: { select: { supplierId: true } } },
    });
    return { data: rows.map((r) => this.mapRole(r)) };
  }

  async createRole(input: any, tenantId: string) {
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
      return this.mapRole(row);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`Un rôle RH nommé « ${n.name} » existe déjà.`);
      }
      throw error;
    }
  }

  async updateRole(id: string, input: any, tenantId: string) {
    const existing = await this.prisma.hrRole.findFirst({
      where: { id, tenantId },
      include: { suppliers: { select: { supplierId: true } } },
    });
    if (!existing) throw new NotFoundException(`HrRole ${id} introuvable`);
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
    return this.mapRole(row);
  }

  async removeRole(id: string, tenantId: string) {
    const existing = await this.prisma.hrRole.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrRole ${id} introuvable`);
    await this.prisma.hrRole.delete({ where: { id } }); // cascade jointures + persons
    return { deleted: true };
  }

  // ── Sinking rules (STF-2 : dotation conditionnelle par rôle × sous-type FNB) ─

  private mapSinkingRule(r: any) {
    return {
      id: r.id,
      roleId: r.roleId,
      fnbCategory: r.fnbCategory,
      conditionAttribute: r.conditionAttribute,
      conditionMinValue: r.conditionMinValue,
      mandatoryQty: r.mandatoryQty,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async findAllSinkingRules(tenantId: string, filter: { roleId?: string } = {}) {
    const rows = await this.prisma.hrSinkingRule.findMany({
      where: { tenantId, ...(filter.roleId && { roleId: filter.roleId }) },
      orderBy: { createdAt: 'asc' },
    });
    return { data: rows.map((r) => this.mapSinkingRule(r)) };
  }

  private async assertValidSinkingRule(input: any, existing?: any) {
    const [fnbCategory] = await this.resolveFnbCategories([input.fnbCategory ?? existing?.fnbCategory]);
    const conditionAttribute =
      input.conditionAttribute !== undefined ? (input.conditionAttribute || null) : (existing?.conditionAttribute ?? null);
    const conditionMinValue =
      input.conditionMinValue !== undefined ? input.conditionMinValue : (existing?.conditionMinValue ?? null);
    if (conditionAttribute && (conditionMinValue === null || conditionMinValue === undefined)) {
      throw new BadRequestException('conditionMinValue est requis quand conditionAttribute est renseigné.');
    }
    const mandatoryQty = input.mandatoryQty !== undefined ? Number(input.mandatoryQty) : (existing?.mandatoryQty ?? 1);
    if (!Number.isFinite(mandatoryQty) || mandatoryQty < 1) {
      throw new BadRequestException('mandatoryQty doit être un entier ≥ 1.');
    }
    return { fnbCategory, conditionAttribute, conditionMinValue: conditionAttribute ? conditionMinValue : null, mandatoryQty };
  }

  async createSinkingRule(input: any, tenantId: string) {
    const role = await this.prisma.hrRole.findFirst({ where: { id: input.roleId, tenantId } });
    if (!role) throw new BadRequestException(`Rôle ${input.roleId} introuvable`);
    const n = await this.assertValidSinkingRule(input);
    try {
      const row = await this.prisma.hrSinkingRule.create({
        data: {
          tenantId,
          roleId: input.roleId,
          fnbCategory: n.fnbCategory,
          conditionAttribute: n.conditionAttribute,
          conditionMinValue: n.conditionMinValue,
          mandatoryQty: n.mandatoryQty,
        },
      });
      return this.mapSinkingRule(row);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException('Une règle identique (même rôle, catégorie et condition) existe déjà.');
      }
      throw error;
    }
  }

  async updateSinkingRule(id: string, input: any, tenantId: string) {
    const existing = await this.prisma.hrSinkingRule.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrSinkingRule ${id} introuvable`);
    const n = await this.assertValidSinkingRule(input, existing);
    try {
      const row = await this.prisma.hrSinkingRule.update({
        where: { id },
        data: {
          fnbCategory: n.fnbCategory,
          conditionAttribute: n.conditionAttribute,
          conditionMinValue: n.conditionMinValue,
          mandatoryQty: n.mandatoryQty,
        },
      });
      return this.mapSinkingRule(row);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BadRequestException('Une règle identique (même rôle, catégorie et condition) existe déjà.');
      }
      throw error;
    }
  }

  async removeSinkingRule(id: string, tenantId: string) {
    const existing = await this.prisma.hrSinkingRule.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrSinkingRule ${id} introuvable`);
    await this.prisma.hrSinkingRule.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Persons ────────────────────────────────────────────────────────────────

  async findAllPersons(tenantId: string, filter: { roleId?: string; contractType?: string }) {
    const rows = await this.prisma.hrPerson.findMany({
      where: {
        tenantId,
        ...(filter.roleId && { roleId: filter.roleId }),
        ...(filter.contractType && { contractType: filter.contractType }),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return { data: rows.map((p) => this.mapPerson(p)) };
  }

  async createPerson(
    input: {
      roleId: string;
      firstName: string;
      lastName: string;
      contractType: string;
      hourlyRate?: number;
      active?: boolean;
    },
    tenantId: string,
  ) {
    if (!(HR_PERSON_CONTRACTS as readonly string[]).includes(input.contractType)) {
      throw new BadRequestException(`contractType invalide pour une personne : ${input.contractType}`);
    }
    const role = await this.prisma.hrRole.findFirst({ where: { id: input.roleId, tenantId } });
    if (!role) throw new BadRequestException(`Rôle ${input.roleId} introuvable`);
    const row = await this.prisma.hrPerson.create({
      data: {
        tenantId,
        roleId: input.roleId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        contractType: input.contractType,
        hourlyRate: input.hourlyRate ?? null,
        active: input.active ?? true,
      },
    });
    return this.mapPerson(row);
  }

  async updatePerson(id: string, input: any, tenantId: string) {
    const existing = await this.prisma.hrPerson.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrPerson ${id} introuvable`);
    if (input.contractType !== undefined && !(HR_PERSON_CONTRACTS as readonly string[]).includes(input.contractType)) {
      throw new BadRequestException(`contractType invalide : ${input.contractType}`);
    }
    if (input.roleId !== undefined) {
      const role = await this.prisma.hrRole.findFirst({ where: { id: input.roleId, tenantId } });
      if (!role) throw new BadRequestException(`Rôle ${input.roleId} introuvable`);
    }
    const row = await this.prisma.hrPerson.update({
      where: { id },
      data: {
        ...(input.roleId !== undefined && { roleId: input.roleId }),
        ...(input.firstName !== undefined && { firstName: String(input.firstName).trim() }),
        ...(input.lastName !== undefined && { lastName: String(input.lastName).trim() }),
        ...(input.contractType !== undefined && { contractType: input.contractType }),
        ...(input.hourlyRate !== undefined && { hourlyRate: input.hourlyRate }),
        ...(input.active !== undefined && { active: input.active }),
      },
    });
    return this.mapPerson(row);
  }

  async removePerson(id: string, tenantId: string) {
    const existing = await this.prisma.hrPerson.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException(`HrPerson ${id} introuvable`);
    await this.prisma.hrPerson.delete({ where: { id } });
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
        await this.prisma.hrRole.create({ data: data(name) });
      } catch (error: any) {
        // Legacy : un même nom de position pouvait exister chez plusieurs agences.
        if (error.code !== 'P2002') throw error;
        await this.prisma.hrRole.create({ data: data(`${name} (${importedRoles + 1})`) });
      }
      importedRoles++;
    }

    return { importedSuppliers, importedRoles };
  }
}
