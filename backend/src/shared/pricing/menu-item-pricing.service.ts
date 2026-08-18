import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Source de vérité UNIQUE du calcul de prix (TTC, HT, taxe, remise) — catalogue
 * menu items ET Data Integration Weezevent.
 *
 * Principe : on n'invente rien. La TVA et la devise viennent de la donnée
 * (article, config tenant, ou produit/prix Weezevent). Si l'info n'existe pas,
 * on renvoie `null` (pas de défaut 20 % ni de devise codée en dur) → le front
 * sait que la valeur est inconnue et décide quoi afficher.
 */
@Injectable()
export class MenuItemPricingService {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber(value: unknown, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private round2(value: number) {
    return Math.round((this.toNumber(value) + Number.EPSILON) * 100) / 100;
  }

  /** Dernier taux TVA tenant (TenantVatConfig) ; `null` si non configuré (pas de 20 par défaut). */
  async getTenantDefaultVatRate(tenantId: string): Promise<number | null> {
    const cfg = await this.prisma.tenantVatConfig.findFirst({
      where: { tenantId },
      orderBy: { effectiveFrom: 'desc' },
      select: { defaultVatRate: true },
    });
    if (!cfg) return null;
    const n = Number(cfg.defaultVatRate);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Décomposition de prix dénormalisée. `basePrice` = TTC brut.
   * Taux résolu : `item.vatRate` → `vatFallback` → `null` (HT/TVA alors `null`).
   * `currency` vient de l'appelant (donnée réelle) → `null` si inconnue.
   * TVA assise sur le net (après remise, règle FR).
   */
  computePricing(item: any, vatFallback: number | null, currency: string | null = null) {
    const basePrice = this.toNumber(item?.basePrice, 0); // TTC brut
    const resolved = item?.vatRate != null ? this.toNumber(item.vatRate) : vatFallback;
    const hasVat = resolved != null && Number.isFinite(resolved);
    const vatRate = hasVat ? (resolved as number) : null;
    const divisor = hasVat ? 1 + (vatRate as number) / 100 : 1;

    const grossTtc = this.round2(basePrice);
    const grossHt = hasVat ? this.round2(basePrice / divisor) : null;
    const grossVat = hasVat ? this.round2(grossTtc - (grossHt as number)) : null;

    const discountType: 'percent' | 'amount' | null =
      item?.discountType === 'percent' || item?.discountType === 'amount'
        ? item.discountType
        : null;
    const discountValue = this.toNumber(item?.discountValue, 0);
    let discountTtc = 0;
    if (discountType === 'percent') discountTtc = this.round2((basePrice * discountValue) / 100);
    else if (discountType === 'amount') discountTtc = this.round2(discountValue);
    // Clamp 0..max(TTC,0) : borne haute `Math.max(grossTtc, 0)` pour supporter les prix
    // NÉGATIFS (remises/avoirs) — sinon un prix négatif sans remise voyait sa remise clampée
    // à `grossTtc` (négatif), ramenant le net à 0 au lieu de conserver le négatif.
    discountTtc = Math.min(Math.max(discountTtc, 0), Math.max(grossTtc, 0));

    const netTtc = this.round2(grossTtc - discountTtc);
    const netHt = hasVat ? this.round2(netTtc / divisor) : null;
    const netVat = hasVat ? this.round2(netTtc - (netHt as number)) : null;

    // Pas de base de coût (ex. produit Weezevent) ou pas de TVA → cost/margin = null.
    // `totalCost` = coût TOTAL de la recette (fournée) ; le coût pertinent face au prix de vente
    // d'UNE portion est le coût PAR PIÈCE = totalCost / numberOfPiecesRecipe (défaut 1). Les produits
    // Weezevent n'ont pas de numberOfPiecesRecipe → pieces = 1 → coût inchangé.
    const hasCost = item?.totalCost != null;
    const pieces = Math.max(this.toNumber(item?.numberOfPiecesRecipe, 1), 1);
    const cost = this.toNumber(item?.totalCost, 0) / pieces;
    const margin =
      hasCost && hasVat && (netHt as number) > 0
        ? this.round2((((netHt as number) - cost) / (netHt as number)) * 100)
        : null;

    return {
      currency: currency ?? null,
      vatRate,
      discount: { type: discountType, value: discountType ? discountValue : 0 },
      gross: { ttc: grossTtc, ht: grossHt, vat: grossVat },
      net: { ttc: netTtc, ht: netHt, vat: netVat },
      discountAmount: {
        ttc: this.round2(grossTtc - netTtc),
        ht: hasVat ? this.round2((grossHt as number) - (netHt as number)) : null,
        vat: hasVat ? this.round2((grossVat as number) - (netVat as number)) : null,
      },
      cost: hasCost ? this.round2(cost) : null,
      margin,
    };
  }

  /** Renvoie une copie de l'item enrichie de `pricing` (no-op si null). */
  withPricing<T extends Record<string, any>>(
    item: T | null | undefined,
    vatFallback: number | null,
    currency: string | null = null,
  ) {
    if (!item) return item ?? null;
    return { ...item, pricing: this.computePricing(item, vatFallback, currency) };
  }

  /**
   * Normalise une entrée `spacePrices`. Deux formes acceptées (rétro-compatibilité) :
   *  - legacy  : un nombre = TTC seul (TVA héritée de l'article) ;
   *  - courante: `{ ttc, vatRate }` = TVA propre à l'espace (spec « TVA pratiquée par espace »).
   * Renvoie `{ ttc, vatRate }` (`vatRate` null si non fournie) ou `null` si TTC invalide.
   */
  normalizeSpacePrice(raw: unknown): { ttc: number; vatRate: number | null } | null {
    if (raw == null) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      const ttc = Number((raw as any).ttc);
      if (!Number.isFinite(ttc)) return null;
      const v = (raw as any).vatRate;
      return { ttc, vatRate: v != null && Number.isFinite(Number(v)) ? Number(v) : null };
    }
    const n = Number(raw);
    return Number.isFinite(n) ? { ttc: n, vatRate: null } : null;
  }

  /**
   * Décompose chaque prix par espace (`spacePrices`). Chaque entrée porte son propre TTC et,
   * si présente, sa propre TVA (sinon repli sur la TVA de l'article puis `vatFallback`).
   * Renvoie `{ [spaceId]: pricing }` ou null.
   */
  computeSpacePricing(item: any, vatFallback: number | null, currency: string | null = null) {
    const sp = item?.spacePrices;
    if (!sp || typeof sp !== 'object' || Array.isArray(sp)) return null;
    const out: Record<string, ReturnType<MenuItemPricingService['computePricing']>> = {};
    for (const [spaceId, raw] of Object.entries(sp)) {
      const entry = this.normalizeSpacePrice(raw);
      if (!entry) continue;
      const vatRate = entry.vatRate ?? (item?.vatRate != null ? Number(item.vatRate) : null);
      out[spaceId] = this.computePricing({ ...item, basePrice: entry.ttc, vatRate }, vatFallback, currency);
    }
    return Object.keys(out).length ? out : null;
  }

  /**
   * Vraies locations Weezevent (`SalesLocation`/`WeezeventLocation`) rattachées À CET ESPACE —
   * BUG-335-02 (docs/bugs/) : la version précédente interrogeait `LocationSpaceMapping`
   * (l'étape 1 du wizard, "Space"), dont `salesLocationId` contient en réalité l'id de
   * l'INTÉGRATION entière, pas un id de location individuelle (l'étape 1 rattache toute une
   * intégration à un espace, pas location par location — voir `StepMapSpace.vue::createEvent`
   * appelant `createLocationSpaceMapping(integration.id, spaceId)`). Comparer ces valeurs à
   * `WeezeventTransaction.locationId` (un vrai id de point de vente) ne pouvait donc JAMAIS
   * matcher — le "niveau 1, prioritaire" du cascade de prix n'a jamais résolu quoi que ce soit en
   * pratique, silencieusement.
   *
   * Les vraies locations individuelles sont dans `LocationShopMapping` (étape 2, "Locations" —
   * `salesLocationId` = un vrai `SalesLocation.id`, `spaceElementId` = le shop/PDV du builder
   * auquel cette location est rattachée). On résout donc : les `SpaceElement` de cet espace
   * (mêmes 4 chemins que `SpacesService.getSpaceShops` — Floor/Forecourt/ExternalMerch via
   * Config.spaceId, ou Zone.spaceId direct pour le builder v2), puis les locations mappées à
   * l'un de ces éléments.
   */
  async resolveSpaceLocationIds(tenantId: string, spaceId: string): Promise<string[]> {
    const spaceElements = await this.prisma.spaceElement.findMany({
      where: {
        OR: [
          { floor: { config: { spaceId } } },
          { forecourt: { config: { spaceId } } },
          { externalMerch: { config: { spaceId } } },
          { zone: { spaceId } },
        ],
      },
      select: { id: true },
    });
    if (!spaceElements.length) return [];
    const rows = await this.prisma.locationShopMapping.findMany({
      where: { tenantId, spaceElementId: { in: spaceElements.map((se) => se.id) } },
      select: { salesLocationId: true },
    });
    return [...new Set(rows.map((r) => r.salesLocationId))];
  }

  /**
   * Prix « de l'espace » — STRICTEMENT les ventes DE CET ESPACE (locations mappées à `spaceId`
   * à l'étape 2 du wizard). BUG-335-02 (docs/bugs/) : les anciens niveaux de repli
   * "non-attribué à un autre espace" et "global" ont été supprimés — une location non mappée à
   * l'étape 2 n'est pas "probablement cet espace, juste oubliée", c'est un point de vente que
   * l'utilisateur a explicitement choisi de ne pas rattacher. Emprunter son CA (ou celui d'un
   * AUTRE espace, niveau global) pour l'afficher comme prix de CET espace induisait l'utilisateur
   * en erreur, sans qu'aucun signal ne le distingue à l'écran. Un produit jamais vendu sur les
   * locations mappées à cet espace n'a maintenant aucun prix résolu ici (repli catalogue côté
   * appelant) — honnête plutôt qu'un prix deviné.
   */
  async getSpaceScopedLatestPrices(
    tenantId: string,
    spaceId: string,
    productIds: string[],
    opts: { eventIds?: string[] } = {},
  ): Promise<Map<string, { ttc: number; vatRate: number | null }>> {
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const spaceLocationIds = await this.resolveSpaceLocationIds(tenantId, spaceId);
    if (!spaceLocationIds.length) return new Map();
    return this.getLatestSalesPrices(tenantId, ids, { locationIds: spaceLocationIds, eventIds: opts.eventIds });
  }

  /** Distribution des prix « de l'espace » (affichage) — mêmes règles que getSpaceScopedLatestPrices (BUG-335-02). */
  async getSpaceScopedModalPrices(
    tenantId: string,
    spaceId: string,
    productIds: string[],
  ): Promise<Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>> {
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const spaceLocationIds = await this.resolveSpaceLocationIds(tenantId, spaceId);
    if (!spaceLocationIds.length) return new Map();
    return this.getModalSalesPrices(tenantId, ids, { locationIds: spaceLocationIds });
  }
  // ── Repli par NOM de produit ──────────────────────────────────────────────
  // Un même produit peut exister sous plusieurs `WeezeventProduct` (Weezevent recrée l'item avec un
  // nouvel id chaque saison/event) : la ligne affichée (dernière saison) n'a pas de vente, mais
  // l'historique existe sous le MÊME NOM. On cherche alors le prix par `productName` (scopé tenant/
  // intégration + espace), jamais un prix d'un autre espace. `t."tenantId"` OBLIGATOIRE (les items
  // n'ont pas de tenantId ; le nom n'est pas unique).

  /** Dernier prix non nul par NOM de produit (normalisé casse/espaces). Cf. getLatestSalesPrices. */
  async getLatestSalesPricesByName(
    tenantId: string,
    names: string[],
    opts: { integrationId?: string; locationIds?: string[]; excludeLocationIds?: string[] } = {},
  ): Promise<Map<string, { ttc: number; vatRate: number | null }>> {
    const out = new Map<string, { ttc: number; vatRate: number | null }>();
    if (opts.locationIds && opts.locationIds.length === 0) return out;
    const normToOrig = new Map<string, string>();
    for (const n of names) if (n) normToOrig.set(n.trim().toLowerCase(), n);
    if (!normToOrig.size) return out;
    const normNames = [...normToOrig.keys()];
    const conds: Prisma.Sql[] = [
      Prisma.sql`t."tenantId" = ${tenantId}`,
      Prisma.sql`LOWER(TRIM(ti."productName")) IN (${Prisma.join(normNames)})`,
      Prisma.sql`ti."unitPrice" > 0`,
    ];
    if (opts.integrationId) conds.push(Prisma.sql`t."integrationId" = ${opts.integrationId}`);
    if (opts.locationIds && opts.locationIds.length > 0) conds.push(Prisma.sql`t."locationId" IN (${Prisma.join(opts.locationIds)})`);
    if (opts.excludeLocationIds && opts.excludeLocationIds.length > 0) conds.push(Prisma.sql`(t."locationId" IS NULL OR t."locationId" NOT IN (${Prisma.join(opts.excludeLocationIds)}))`);
    const rows = await this.prisma.$queryRaw<{ nname: string; unitPrice: any; vat: any }[]>(Prisma.sql`
      SELECT DISTINCT ON (LOWER(TRIM(ti."productName"))) LOWER(TRIM(ti."productName")) AS nname, ti."unitPrice", ti."vat"
      FROM "WeezeventTransactionItem" ti
      JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
      WHERE ${Prisma.join(conds, ' AND ')}
      ORDER BY LOWER(TRIM(ti."productName")), t."transactionDate" DESC
    `);
    for (const r of rows) {
      const orig = normToOrig.get(r.nname);
      if (orig) out.set(orig, { ttc: Number(r.unitPrice), vatRate: r.vat != null ? Number(r.vat) : null });
    }
    return out;
  }

  /** Distribution des prix par NOM de produit (normalisé casse/espaces). Cf. getModalSalesPrices. */
  async getModalSalesPricesByName(
    tenantId: string,
    names: string[],
    opts: { integrationId?: string; locationIds?: string[]; excludeLocationIds?: string[] } = {},
  ): Promise<Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>> {
    const out = new Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>();
    if (opts.locationIds && opts.locationIds.length === 0) return out;
    const normToOrig = new Map<string, string>();
    for (const n of names) if (n) normToOrig.set(n.trim().toLowerCase(), n);
    if (!normToOrig.size) return out;
    const normNames = [...normToOrig.keys()];
    const conds: Prisma.Sql[] = [
      Prisma.sql`t."tenantId" = ${tenantId}`,
      Prisma.sql`LOWER(TRIM(ti."productName")) IN (${Prisma.join(normNames)})`,
      Prisma.sql`ti."unitPrice" > 0`,
    ];
    if (opts.integrationId) conds.push(Prisma.sql`t."integrationId" = ${opts.integrationId}`);
    if (opts.locationIds && opts.locationIds.length > 0) conds.push(Prisma.sql`t."locationId" IN (${Prisma.join(opts.locationIds)})`);
    if (opts.excludeLocationIds && opts.excludeLocationIds.length > 0) conds.push(Prisma.sql`(t."locationId" IS NULL OR t."locationId" NOT IN (${Prisma.join(opts.excludeLocationIds)}))`);
    const rows = await this.prisma.$queryRaw<{ nname: string; unitPrice: any; vat: any; n: number }[]>(Prisma.sql`
      SELECT LOWER(TRIM(ti."productName")) AS nname, ti."unitPrice", ti."vat", count(*)::int AS n
      FROM "WeezeventTransactionItem" ti
      JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY LOWER(TRIM(ti."productName")), ti."unitPrice", ti."vat"
      ORDER BY LOWER(TRIM(ti."productName")), n DESC
    `);
    for (const r of rows) {
      const orig = normToOrig.get(r.nname);
      if (!orig) continue;
      const ttc = Number(r.unitPrice);
      const vatRate = r.vat != null ? Number(r.vat) : null;
      const ht = vatRate != null ? this.round2(ttc / (1 + vatRate / 100)) : null;
      const list = out.get(orig) ?? [];
      list.push({ ttc, ht, vatRate, salesCount: Number(r.n) });
      out.set(orig, list);
    }
    return out;
  }

  /** Prix « de l'espace » par NOM — strictement les locations mappées à cet espace (BUG-335-02). */
  async getSpaceScopedLatestPricesByName(
    tenantId: string,
    spaceId: string,
    names: string[],
    opts: { integrationId?: string } = {},
  ): Promise<Map<string, { ttc: number; vatRate: number | null }>> {
    const uniq = [...new Set(names.filter(Boolean))];
    if (!uniq.length) return new Map();
    const spaceLocationIds = await this.resolveSpaceLocationIds(tenantId, spaceId);
    if (!spaceLocationIds.length) return new Map();
    return this.getLatestSalesPricesByName(tenantId, uniq, { integrationId: opts.integrationId, locationIds: spaceLocationIds });
  }

  /** Distribution des prix « de l'espace » par NOM — mêmes règles (BUG-335-02). */
  async getSpaceScopedModalPricesByName(
    tenantId: string,
    spaceId: string,
    names: string[],
    opts: { integrationId?: string } = {},
  ): Promise<Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>> {
    const uniq = [...new Set(names.filter(Boolean))];
    if (!uniq.length) return new Map();
    const spaceLocationIds = await this.resolveSpaceLocationIds(tenantId, spaceId);
    if (!spaceLocationIds.length) return new Map();
    return this.getModalSalesPricesByName(tenantId, uniq, { integrationId: opts.integrationId, locationIds: spaceLocationIds });
  }

  // ── Repli par item_id WEEZEVENT (lien le plus fiable) ─────────────────────
  // Le lien le plus sûr vente↔produit = l'id Weezevent de l'item, TOUJOURS présent dans
  // `ti."rawData"->>'item_id'` (indépendant du FK productId et du productName). Résout le cas où
  // le FK est absent/pointe ailleurs ET où le nom diffère.

  /** Dernier prix non nul par item_id Weezevent (rawData.item_id). Cf. getLatestSalesPrices. */
  async getLatestSalesPricesByWeezeventId(
    tenantId: string,
    weezeventIds: string[],
    opts: { integrationId?: string; locationIds?: string[]; excludeLocationIds?: string[] } = {},
  ): Promise<Map<string, { ttc: number; vatRate: number | null }>> {
    const out = new Map<string, { ttc: number; vatRate: number | null }>();
    if (opts.locationIds && opts.locationIds.length === 0) return out;
    const uniq = [...new Set(weezeventIds.filter(Boolean).map(String))];
    if (!uniq.length) return out;
    const conds: Prisma.Sql[] = [
      Prisma.sql`t."tenantId" = ${tenantId}`,
      Prisma.sql`(ti."rawData"->>'item_id') IN (${Prisma.join(uniq)})`,
      Prisma.sql`ti."unitPrice" > 0`,
    ];
    if (opts.integrationId) conds.push(Prisma.sql`t."integrationId" = ${opts.integrationId}`);
    if (opts.locationIds && opts.locationIds.length > 0) conds.push(Prisma.sql`t."locationId" IN (${Prisma.join(opts.locationIds)})`);
    if (opts.excludeLocationIds && opts.excludeLocationIds.length > 0) conds.push(Prisma.sql`(t."locationId" IS NULL OR t."locationId" NOT IN (${Prisma.join(opts.excludeLocationIds)}))`);
    const rows = await this.prisma.$queryRaw<{ wid: string; unitPrice: any; vat: any }[]>(Prisma.sql`
      SELECT DISTINCT ON ((ti."rawData"->>'item_id')) (ti."rawData"->>'item_id') AS wid, ti."unitPrice", ti."vat"
      FROM "WeezeventTransactionItem" ti
      JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
      WHERE ${Prisma.join(conds, ' AND ')}
      ORDER BY (ti."rawData"->>'item_id'), t."transactionDate" DESC
    `);
    for (const r of rows) if (r.wid) out.set(r.wid, { ttc: Number(r.unitPrice), vatRate: r.vat != null ? Number(r.vat) : null });
    return out;
  }

  /** Distribution des prix par item_id Weezevent. Cf. getModalSalesPrices. */
  async getModalSalesPricesByWeezeventId(
    tenantId: string,
    weezeventIds: string[],
    opts: { integrationId?: string; locationIds?: string[]; excludeLocationIds?: string[] } = {},
  ): Promise<Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>> {
    const out = new Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>();
    if (opts.locationIds && opts.locationIds.length === 0) return out;
    const uniq = [...new Set(weezeventIds.filter(Boolean).map(String))];
    if (!uniq.length) return out;
    const conds: Prisma.Sql[] = [
      Prisma.sql`t."tenantId" = ${tenantId}`,
      Prisma.sql`(ti."rawData"->>'item_id') IN (${Prisma.join(uniq)})`,
      Prisma.sql`ti."unitPrice" > 0`,
    ];
    if (opts.integrationId) conds.push(Prisma.sql`t."integrationId" = ${opts.integrationId}`);
    if (opts.locationIds && opts.locationIds.length > 0) conds.push(Prisma.sql`t."locationId" IN (${Prisma.join(opts.locationIds)})`);
    if (opts.excludeLocationIds && opts.excludeLocationIds.length > 0) conds.push(Prisma.sql`(t."locationId" IS NULL OR t."locationId" NOT IN (${Prisma.join(opts.excludeLocationIds)}))`);
    const rows = await this.prisma.$queryRaw<{ wid: string; unitPrice: any; vat: any; n: number }[]>(Prisma.sql`
      SELECT (ti."rawData"->>'item_id') AS wid, ti."unitPrice", ti."vat", count(*)::int AS n
      FROM "WeezeventTransactionItem" ti
      JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY (ti."rawData"->>'item_id'), ti."unitPrice", ti."vat"
      ORDER BY (ti."rawData"->>'item_id'), n DESC
    `);
    for (const r of rows) {
      if (!r.wid) continue;
      const ttc = Number(r.unitPrice);
      const vatRate = r.vat != null ? Number(r.vat) : null;
      const ht = vatRate != null ? this.round2(ttc / (1 + vatRate / 100)) : null;
      const list = out.get(r.wid) ?? [];
      list.push({ ttc, ht, vatRate, salesCount: Number(r.n) });
      out.set(r.wid, list);
    }
    return out;
  }

  /** Prix « de l'espace » par item_id Weezevent — strictement les locations mappées à cet espace (BUG-335-02). */
  async getSpaceScopedLatestPricesByWeezeventId(
    tenantId: string,
    spaceId: string,
    weezeventIds: string[],
    opts: { integrationId?: string } = {},
  ): Promise<Map<string, { ttc: number; vatRate: number | null }>> {
    const uniq = [...new Set(weezeventIds.filter(Boolean).map(String))];
    if (!uniq.length) return new Map();
    const spaceLocationIds = await this.resolveSpaceLocationIds(tenantId, spaceId);
    if (!spaceLocationIds.length) return new Map();
    return this.getLatestSalesPricesByWeezeventId(tenantId, uniq, { integrationId: opts.integrationId, locationIds: spaceLocationIds });
  }

  /** Distribution des prix « de l'espace » par item_id Weezevent — mêmes règles (BUG-335-02). */
  async getSpaceScopedModalPricesByWeezeventId(
    tenantId: string,
    spaceId: string,
    weezeventIds: string[],
    opts: { integrationId?: string } = {},
  ): Promise<Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>> {
    const uniq = [...new Set(weezeventIds.filter(Boolean).map(String))];
    if (!uniq.length) return new Map();
    const spaceLocationIds = await this.resolveSpaceLocationIds(tenantId, spaceId);
    if (!spaceLocationIds.length) return new Map();
    return this.getModalSalesPricesByWeezeventId(tenantId, uniq, { integrationId: opts.integrationId, locationIds: spaceLocationIds });
  }

  /**
   * Dernier prix de vente NON NUL par produit (le plus récent par `transactionDate`). Spec :
   * « le dernier prix unitaire TTC (le plus récent) ». La condition `unitPrice > 0` + le tri
   * décroissant réalisent la règle « si le dernier est 0, on remonte jusqu'au vrai prix » : on
   * saute les ventes à 0 (gratuités / data) et on retient la 1re vente non nulle. Un produit
   * sans AUCUNE vente non nulle est ABSENT de la Map → l'appelant retombe sur le catalogue (on ne
   * conclut jamais un 0 arbitraire). `opts.locationIds` scope à un espace (sinon tous espaces) ;
   * `opts.eventIds` scope à un/des event(s) (priorité event — l'appelant gère le repli). `unitPrice`
   * Weezevent est TTC → HT dérivé par l'appelant. Requête unique indexée
   * (`(tenantId, locationId, transactionDate)` + `productId`).
   */
  async getLatestSalesPrices(
    tenantId: string,
    productIds: string[],
    opts: { locationIds?: string[]; excludeLocationIds?: string[]; eventIds?: string[] } = {},
  ): Promise<Map<string, { ttc: number; vatRate: number | null }>> {
    const out = new Map<string, { ttc: number; vatRate: number | null }>();
    const ids = [...new Set(productIds.filter(Boolean))];
    if (ids.length === 0) return out;
    // Espace explicitement sans location mappée → aucune vente attribuable à cet espace.
    if (opts.locationIds && opts.locationIds.length === 0) return out;
    // BUG-332-02 (docs/bugs/) : le commentaire ci-dessus promettait déjà l'index
    // (tenantId, locationId, transactionDate) — jamais engagé faute de ce filtre. Sans lui, le
    // JOIN vers "WeezeventTransaction" force un Seq Scan de TOUTE la table (tous tenants, ~1,8M
    // lignes mesurées) pour construire le côté hash du join → ~23s sur un tenant à gros volume,
    // largement au-delà du timeout du proxy Render (502 côté front). Même correctif déjà en place
    // sur getLatestSalesPricesByName/getLatestSalesPricesByWeezeventId (plus bas dans ce fichier).
    const conds: Prisma.Sql[] = [
      Prisma.sql`t."tenantId" = ${tenantId}`,
      Prisma.sql`ti."productId" IN (${Prisma.join(ids)})`,
      Prisma.sql`ti."unitPrice" > 0`,
    ];
    if (opts.locationIds && opts.locationIds.length > 0) {
      conds.push(Prisma.sql`t."locationId" IN (${Prisma.join(opts.locationIds)})`);
    }
    // Exclusion (repli « pas un autre espace ») : ventes NON attribuées aux locations d'autres
    // espaces — inclut les ventes sans location (null) ou sur des locations non mappées.
    if (opts.excludeLocationIds && opts.excludeLocationIds.length > 0) {
      conds.push(Prisma.sql`(t."locationId" IS NULL OR t."locationId" NOT IN (${Prisma.join(opts.excludeLocationIds)}))`);
    }
    // Filtre event optionnel (priorité event) : ne s'applique que si des ids sont fournis, sinon
    // « tous events » (le tri transactionDate DESC prend alors naturellement l'event le plus récent).
    if (opts.eventIds && opts.eventIds.length > 0) {
      conds.push(Prisma.sql`t."eventId" IN (${Prisma.join(opts.eventIds)})`);
    }
    const rows = await this.prisma.$queryRaw<{ productId: string; unitPrice: any; vat: any }[]>(Prisma.sql`
      SELECT DISTINCT ON (ti."productId") ti."productId", ti."unitPrice", ti."vat"
      FROM "WeezeventTransactionItem" ti
      JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
      WHERE ${Prisma.join(conds, ' AND ')}
      ORDER BY ti."productId", t."transactionDate" DESC
    `);
    for (const r of rows) {
      const ttc = Number(r.unitPrice);
      out.set(r.productId, { ttc, vatRate: r.vat != null ? Number(r.vat) : null });
    }
    return out;
  }

  // ── Weezevent / Data Integration ────────────────────────────────────────────

  /** Devise réelle d'un produit Weezevent via ses prix configurés (WeezeventPrice.currency). */
  private resolveProductCurrency(product: any): string | null {
    const prices = product?.prices;
    if (Array.isArray(prices)) {
      const withCur = prices.find((p: any) => p?.currency);
      if (withCur) return withCur.currency as string;
    }
    return null;
  }

  /**
   * Agrégats de ventes réelles par produit (depuis WeezeventTransactionItem).
   * `opts.integrationId` / `opts.fromDate` / `opts.toDate` scopent l'agrégat : ils
   * activent l'index `[tenantId, integrationId, transactionDate]` de WeezeventTransaction
   * au lieu d'un seq scan sur tout l'historique (~12 s → quelques ms par intégration).
   * ⚠️ N'utiliser `integrationId` que si les `productIds` appartiennent tous à cette
   * intégration (sinon les ventes des autres intégrations sont exclues à tort).
   */
  private async weezeventSalesByProduct(
    tenantId: string,
    productIds: string[],
    opts: { integrationId?: string; fromDate?: Date; toDate?: Date } = {},
  ) {
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!ids.length) return new Map<string, any>();
    const conds: Prisma.Sql[] = [
      Prisma.sql`t."tenantId" = ${tenantId}`,
      Prisma.sql`ti."productId" IN (${Prisma.join(ids)})`,
    ];
    if (opts.integrationId) conds.push(Prisma.sql`t."integrationId" = ${opts.integrationId}`);
    if (opts.fromDate) conds.push(Prisma.sql`t."transactionDate" >= ${opts.fromDate}`);
    if (opts.toDate) conds.push(Prisma.sql`t."transactionDate" <= ${opts.toDate}`);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ti."productId" AS "productId",
        SUM(ti."quantity")::float8                                              AS qty,
        SUM(ti."unitPrice" * ti."quantity")::float8                             AS gross_ttc,
        SUM(ti."unitPrice" * ti."quantity" / (1 + ti."vat" / 100.0))::float8    AS gross_ht,
        SUM(ti."reduction")::float8                                             AS reduction_ttc,
        SUM((ti."unitPrice" * ti."quantity" - ti."reduction")
            / (1 + ti."vat" / 100.0))::float8                                   AS net_ht
      FROM "WeezeventTransactionItem" ti
      JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY ti."productId"
    `);
    return new Map(rows.map((r) => [r.productId, r]));
  }

  /** Décomposition du prix RÉELLEMENT ENCAISSÉ (agrégé sur les ventes) d'un produit. */
  private computeSalesPricing(agg: any, currency: string | null) {
    if (!agg) return null;
    const grossTtc = this.round2(agg.gross_ttc);
    const grossHt = this.round2(agg.gross_ht);
    const reductionTtc = this.round2(agg.reduction_ttc);
    const netTtc = this.round2(grossTtc - reductionTtc);
    const netHt = this.round2(agg.net_ht);
    const qty = this.toNumber(agg.qty, 0);
    return {
      currency: currency ?? null,
      quantity: qty,
      gross: { ttc: grossTtc, ht: grossHt, vat: this.round2(grossTtc - grossHt) },
      reduction: { ttc: reductionTtc },
      net: { ttc: netTtc, ht: netHt, vat: this.round2(netTtc - netHt) },
      avgUnitPriceTtc: qty > 0 ? this.round2(grossTtc / qty) : null,
    };
  }

  /**
   * Prix de vente « modal » par produit Weezevent : un point par couple (unitPrice, vat),
   * trié par fréquence DÉCROISSANTE (le premier = prix le plus pratiqué). C'est exactement
   * le prix déjà calculé/affiché à l'étape 3 — on ne parcourt rien de neuf, requête unique
   * indexée (WeezeventTransactionItem_productId_idx, ~20 ms/100 produits), scopée par
   * productId (vérifiés côté tenant par l'appelant ; le raw n'est pas CLS). `unitPrice`
   * Weezevent est TTC → HT = round2(TTC / (1 + vat/100)).
   * `opts.locationIds` scope la distribution à un espace (join `WeezeventTransaction.locationId`) ;
   * `[]` = espace sans location mappée → aucune vente attribuable (Map vide).
   */
  async getModalSalesPrices(
    tenantId: string,
    productIds: string[],
    opts: { locationIds?: string[]; excludeLocationIds?: string[] } = {},
  ): Promise<Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>> {
    const out = new Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>();
    const ids = [...new Set(productIds.filter(Boolean))];
    if (ids.length === 0) return out;
    // Espace explicitement sans location mappée → aucune vente attribuable à cet espace.
    if (opts.locationIds && opts.locationIds.length === 0) return out;
    const hasLoc = !!(opts.locationIds && opts.locationIds.length > 0);
    const hasExcl = !!(opts.excludeLocationIds && opts.excludeLocationIds.length > 0);
    const needsJoin = hasLoc || hasExcl;
    const conds: Prisma.Sql[] = [
      Prisma.sql`ti."productId" IN (${Prisma.join(ids)})`,
      Prisma.sql`ti."unitPrice" > 0`,
    ];
    // BUG-332-02 (docs/bugs/) : le filtre tenantId ne peut porter sur `t` que si le JOIN est
    // présent — sans location filter, needsJoin=false et le chemin reste volontairement le
    // "fast path" documenté ci-dessus (productId déjà vérifié tenant par l'appelant, pas de join).
    if (needsJoin) conds.push(Prisma.sql`t."tenantId" = ${tenantId}`);
    if (hasLoc) conds.push(Prisma.sql`t."locationId" IN (${Prisma.join(opts.locationIds!)})`);
    if (hasExcl) conds.push(Prisma.sql`(t."locationId" IS NULL OR t."locationId" NOT IN (${Prisma.join(opts.excludeLocationIds!)}))`);
    const rows = await this.prisma.$queryRaw<{ productId: string; unitPrice: any; vat: any; n: number }[]>(Prisma.sql`
      SELECT ti."productId", ti."unitPrice", ti."vat", count(*)::int AS n
      FROM "WeezeventTransactionItem" ti
      ${needsJoin ? Prisma.sql`JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"` : Prisma.empty}
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY ti."productId", ti."unitPrice", ti."vat"
      ORDER BY ti."productId", n DESC
    `);
    for (const r of rows) {
      const ttc = Number(r.unitPrice);
      const vatRate = r.vat != null ? Number(r.vat) : null;
      const ht = vatRate != null ? this.round2(ttc / (1 + vatRate / 100)) : null;
      const list = out.get(r.productId) ?? [];
      list.push({ ttc, ht, vatRate, salesCount: Number(r.n) });
      out.set(r.productId, list);
    }
    return out;
  }

  /**
   * Prix à appliquer à un menu item depuis un produit Weezevent. Priorité (décision produit) :
   * le DERNIER prix de vente non nul (le plus récent, déjà scopé à l'espace par l'appelant via
   * `getLatestSalesPrices`), sinon le prix catalogue Weezevent (`product.basePrice`) en repli.
   * Renvoie `null` si on ne sait rien (ni vente, ni catalogue) → on n'applique PAS (on ne conclut
   * jamais un 0 arbitraire). `vatRate` : article Weezevent (`product.vatRate`) sinon TVA de la
   * vente. `currency` vient des prix configurés.
   */
  resolveWeezeventApplyPrice(
    product: any,
    latest: { ttc: number; vatRate: number | null } | undefined,
  ): { basePrice: number; vatRate: number | null; currency: string | null; source: 'weezevent_catalog' | 'weezevent_sales' } | null {
    const currency = this.resolveProductCurrency(product);
    if (latest && Number.isFinite(latest.ttc) && latest.ttc > 0) {
      return {
        basePrice: this.round2(latest.ttc),
        vatRate: product?.vatRate != null ? Number(product.vatRate) : latest.vatRate,
        currency,
        source: 'weezevent_sales',
      };
    }
    if (product?.basePrice != null) {
      return {
        basePrice: this.round2(Number(product.basePrice)),
        vatRate: product.vatRate != null ? Number(product.vatRate) : null,
        currency,
        source: 'weezevent_catalog',
      };
    }
    return null;
  }

  /**
   * Enrichit les mappings produit↔menu item de l'étape 3 avec TOUT le prix, le front
   * décide quoi afficher :
   *  - `menuItem.pricing`            → prix catalogue DataFriday (TVA article/tenant)
   *  - `weezeventProduct.pricing`    → prix de RÉFÉRENCE Weezevent (TVA + devise réelles)
   *  - `weezeventProduct.salesPricing` → prix RÉELLEMENT ENCAISSÉ (agrégé sur les ventes)
   *  - `weezeventProduct.prices`     → prix configurés en amont (déjà inclus par l'appelant)
   * Les appelants doivent inclure `weezeventProduct: { include: { prices: true } }`.
   *
   * `opts.includeSales` (défaut `true`) pilote le calcul de `salesPricing`. Cet agrégat
   * (`weezeventSalesByProduct`) est COÛTEUX : un GROUP BY sur tout l'historique
   * `WeezeventTransactionItem` (centaines de milliers de lignes, ~12 s mesurées en staging)
   * sans borne de date ni d'intégration. Le mettre à `false` pour les appelants qui ne lisent
   * que les paires produit↔menuItem (ex. chargement étape 3 Data Integration) : `salesPricing`
   * vaut alors `null` et on évite l'agrégat sur le chemin critique.
   *
   * `opts.integrationId` / `opts.fromDate` / `opts.toDate` (avec `includeSales`) scopent
   * l'agrégat ventes pour le rendre rapide — à ne renseigner que si tous les mappings
   * passés appartiennent à cette intégration (cf. `weezeventSalesByProduct`).
   */
  async enrichMappingsPricing(
    mappings: any[],
    tenantId: string,
    opts: {
      includeSales?: boolean;
      integrationId?: string;
      fromDate?: Date;
      toDate?: Date;
    } = {},
  ) {
    const { includeSales = true, integrationId, fromDate, toDate } = opts;
    const tenantVatRate = await this.getTenantDefaultVatRate(tenantId);
    const salesByProduct = includeSales
      ? await this.weezeventSalesByProduct(
          tenantId,
          mappings
            .map((m) => m.weezeventProductId ?? m.salesProduct?.id)
            .filter(Boolean) as string[],
          { integrationId, fromDate, toDate },
        )
      : new Map<string, any>();

    return mappings.map((m) => {
      const product = m.salesProduct;
      const currency = this.resolveProductCurrency(product);
      return {
        ...m,
        menuItem: this.withPricing(m.menuItem, tenantVatRate, null),
        weezeventProduct: product
          ? {
              ...product,
              pricing: this.computePricing(product, null, currency),
              salesPricing: includeSales
                ? this.computeSalesPricing(salesByProduct.get(product.id), currency)
                : null,
            }
          : product,
      };
    });
  }
}
