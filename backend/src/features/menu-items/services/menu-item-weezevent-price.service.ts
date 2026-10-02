import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { MenuItemPricingService } from '../../../shared/pricing/menu-item-pricing.service';
import { linksToSpaceIds, spaceLinksSelect } from '../../../shared/pricing/space-links.util';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { MenuItemSupportService } from './menu-item-support.service';
import { MenuItemQueryService } from './menu-item-query.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

const ASSERT_SPACE_ACCESS_MESSAGES = {
  none: "Cet article n'est rattaché à aucun espace — réservé aux comptes à accès complet.",
  denied: "Vous n'avez pas accès à l'espace de cet article.",
};

/**
 * Prix des articles issus des ventes Weezevent : application, en masse, rattrapage, historique.
 */
@Injectable()
export class MenuItemWeezeventPriceService {
  constructor(
    private prisma: PrismaService,
    private pricing: MenuItemPricingService,
    private spaceAccess: SpaceAccessService,
    private readonly menuItemQueryService: MenuItemQueryService,
    private readonly menuItemSupportService: MenuItemSupportService,
  ) {}

  private readonly logger = new Logger(MenuItemWeezeventPriceService.name);

  // ─── Application du prix Weezevent + historique ──────────────────────────────

  /**
   * Résout le produit Weezevent source d'un menu item : mapping explicite si `weezeventProductId`
   * est fourni, sinon l'unique produit mappé. Lève une 400 si rien n'est mappé ou si plusieurs
   * produits le sont (l'appelant doit alors préciser lequel).
   */
  private async resolveMappedProductId(
    tenantId: string,
    menuItemId: string,
    weezeventProductId?: string,
  ): Promise<string> {
    if (weezeventProductId) {
      const m = await this.prisma.productMapping.findFirst({
        where: { tenantId, menuItemId, salesProductId: weezeventProductId },
        select: { salesProductId: true },
      });
      if (!m) throw new BadRequestException(`Le produit Weezevent ${weezeventProductId} n'est pas mappé à cet article`);
      return m.salesProductId;
    }
    const mappings = await this.prisma.productMapping.findMany({
      where: { tenantId, menuItemId },
      select: { salesProductId: true },
    });
    if (mappings.length === 0) throw new BadRequestException(`Aucun produit Weezevent mappé à cet article`);
    if (mappings.length > 1) {
      throw new BadRequestException(`Plusieurs produits Weezevent mappés à cet article — précisez weezeventProductId`);
    }
    return mappings[0].salesProductId;
  }

  /**
   * Résout le prix à hériter depuis un produit Weezevent. `override` = le prix DU PRODUIT TEL
   * QU'AFFICHÉ côté front : s'il est fourni, le menu item en hérite EXACTEMENT (pas de re-calcul
   * serveur qui divergerait de l'affichage). Sinon, repli : prix dérivé GLOBALEMENT (dernier prix
   * non nul des ventes, sinon catalogue) — JAMAIS scopé à l'espace (l'espace = destination, pas
   * filtre sur la source).
   */
  private async resolveInheritedPrice(
    product: any,
    productId: string,
    tenantId: string,
    override?: { basePrice?: number | null; vatRate?: number | null },
    spaceId?: string,
    eventIds?: string[],
  ) {
    if (override?.basePrice != null && Number.isFinite(Number(override.basePrice))) {
      return {
        basePrice: this.menuItemSupportService.toNumber(override.basePrice),
        vatRate: override.vatRate != null ? this.menuItemSupportService.toNumber(override.vatRate) : null,
        currency: null as string | null,
        source: 'weezevent_catalog' as 'weezevent_catalog' | 'weezevent_sales',
      };
    }
    // Sans override : dernier prix non nul SCOPÉ à l'espace (priorité aux ventes de l'espace, sinon
    // ventes non attribuées à un autre espace — jamais un prix d'un autre espace). Sans espace →
    // dernier prix non nul global (repli historique).
    let latest: { ttc: number; vatRate: number | null } | undefined;
    if (spaceId) {
      latest = (await this.pricing.getSpaceScopedLatestPrices(tenantId, spaceId, [productId], { eventIds })).get(productId);
      if (!latest && eventIds && eventIds.length > 0) {
        latest = (await this.pricing.getSpaceScopedLatestPrices(tenantId, spaceId, [productId])).get(productId);
      }
    } else {
      latest = (await this.pricing.getLatestSalesPrices(tenantId, [productId], {})).get(productId);
    }
    return this.pricing.resolveWeezeventApplyPrice(product, latest);
  }

  async applyWeezeventPrice(
    menuItemId: string,
    tenantId: string,
    weezeventProductId?: string,
    spaceId?: string,
    override?: { basePrice?: number | null; vatRate?: number | null },
    user?: SpaceScopedUser,
  ) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: menuItemId, tenantId, deletedAt: null },
      select: { id: true, basePrice: true, vatRate: true, spaceLinks: spaceLinksSelect },
    });
    if (!item) throw new NotFoundException(`Menu item ${menuItemId} not found`);
    await this.spaceAccess.assertCanAccessAny(user, linksToSpaceIds(item.spaceLinks), ASSERT_SPACE_ACCESS_MESSAGES);

    if (spaceId) {
      // L'upsert SpaceMenuItem associe l'item à l'espace si besoin → l'espace doit être au tenant.
      const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { id: true } });
      if (!space) throw new BadRequestException(`Espace ${spaceId} introuvable pour ce tenant`);
    }

    const productId = await this.resolveMappedProductId(tenantId, menuItemId, weezeventProductId);
    const product = await this.prisma.salesProduct.findFirst({
      where: { id: productId, tenantId },
      include: { prices: true },
    });
    if (!product) throw new BadRequestException(`Produit Weezevent ${productId} introuvable`);

    const resolved = await this.resolveInheritedPrice(product, productId, tenantId, override, spaceId);
    if (!resolved) {
      throw new BadRequestException(`Aucun prix Weezevent disponible pour ce produit (ni ventes, ni catalogue)`);
    }

    if (spaceId) {
      // PRIX PAR ESPACE : ligne SpaceMenuItem (on ne touche plus basePrice = défaut/fallback).
      // L'upsert CRÉE l'association si absente : poser un prix pour un espace = y vendre l'item
      // (soigne au passage les items « mappés sans espace »).
      const link = await this.prisma.spaceMenuItem.findUnique({
        where: { menuItemId_spaceId: { menuItemId, spaceId } },
        select: { priceTtc: true, vatRate: true },
      });
      const previous =
        link?.priceTtc != null
          ? { ttc: this.menuItemSupportService.toNumber(link.priceTtc), vatRate: link.vatRate != null ? this.menuItemSupportService.toNumber(link.vatRate) : null }
          : null;
      const next = { ttc: resolved.basePrice, vatRate: resolved.vatRate ?? null };
      const unchanged = previous != null && previous.ttc === next.ttc && (previous.vatRate ?? null) === next.vatRate;
      if (!unchanged) {
        await this.prisma.$transaction([
          this.prisma.menuItemPriceHistory.create({
            data: {
              menuItemId,
              tenantId,
              spaceId,
              basePrice: resolved.basePrice,
              vatRate: resolved.vatRate,
              currency: resolved.currency,
              source: resolved.source,
              weezeventProductId: productId,
              observedAt: new Date(),
            },
          }),
          this.prisma.spaceMenuItem.upsert({
            where: { menuItemId_spaceId: { menuItemId, spaceId } },
            create: { menuItemId, spaceId, priceTtc: next.ttc, vatRate: next.vatRate },
            update: { priceTtc: next.ttc, vatRate: next.vatRate },
          }),
        ]);
        await this.menuItemSupportService.listCache.invalidate(tenantId);
        this.logger.log(`Applied Weezevent price ${resolved.basePrice} (${resolved.source}) to menu item ${menuItemId} for space ${spaceId}`);
      }
      return { changed: !unchanged, previous, applied: resolved, item: await this.menuItemQueryService.findOne(menuItemId, tenantId) };
    }

    // Sans espace → comportement global historique (prix courant = basePrice).
    const previous = {
      basePrice: this.menuItemSupportService.toNumber(item.basePrice),
      vatRate: item.vatRate != null ? this.menuItemSupportService.toNumber(item.vatRate) : null,
    };
    const unchanged = previous.basePrice === resolved.basePrice && previous.vatRate === (resolved.vatRate ?? null);

    if (!unchanged) {
      await this.prisma.$transaction([
        this.prisma.menuItemPriceHistory.create({
          data: {
            menuItemId,
            tenantId,
            spaceId: null,
            basePrice: resolved.basePrice,
            vatRate: resolved.vatRate,
            currency: resolved.currency,
            source: resolved.source,
            weezeventProductId: productId,
            observedAt: new Date(),
          },
        }),
        this.prisma.menuItem.update({
          where: { id: menuItemId },
          data: { basePrice: resolved.basePrice, vatRate: resolved.vatRate },
        }),
      ]);
      await this.menuItemSupportService.listCache.invalidate(tenantId);
      this.logger.log(`Applied Weezevent price ${resolved.basePrice} (${resolved.source}) to menu item ${menuItemId}`);
    }

    return {
      changed: !unchanged,
      previous,
      applied: resolved,
      item: await this.menuItemQueryService.findOne(menuItemId, tenantId),
    };
  }

  /**
   * Applique le prix Weezevent à plusieurs menu items (action de masse étape 3). Le prix modal
   * et les produits sont requêtés EN UNE FOIS pour tout le lot. Renvoie un résumé par article
   * (changed / applied / error) ; un article en erreur n'interrompt pas les autres.
   */
  async applyWeezeventPricesBulk(
    items: Array<{ menuItemId: string; weezeventProductId?: string; basePrice?: number | null; vatRate?: number | null }>,
    tenantId: string,
    spaceId?: string,
  ) {
    const results: Array<{ menuItemId: string; changed: boolean; applied?: any; previous?: any; error?: string }> = [];
    const pairs: Array<{ menuItemId: string; productId: string; override?: { basePrice?: number | null; vatRate?: number | null } }> = [];

    for (const it of items) {
      try {
        const productId = await this.resolveMappedProductId(tenantId, it.menuItemId, it.weezeventProductId);
        pairs.push({ menuItemId: it.menuItemId, productId, override: { basePrice: it.basePrice, vatRate: it.vatRate } });
      } catch (e) {
        results.push({ menuItemId: it.menuItemId, changed: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    if (pairs.length === 0) return { total: items.length, changed: 0, results };

    if (spaceId) {
      // Les upserts SpaceMenuItem associent les items à l'espace si besoin → espace du tenant requis.
      const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { id: true } });
      if (!space) throw new BadRequestException(`Espace ${spaceId} introuvable pour ce tenant`);
    }

    const productIds = [...new Set(pairs.map((p) => p.productId))];
    const menuItemIds = [...new Set(pairs.map((p) => p.menuItemId))];
    // Repli (si le front n'envoie pas le prix affiché) : dernier prix non nul par produit, SCOPÉ à
    // l'espace ciblé quand il y en a un (priorité espace, sinon ventes non attribuées à un autre
    // espace — jamais un prix d'un autre espace), sinon global.
    const [products, latest, menuItems, links] = await Promise.all([
      this.prisma.salesProduct.findMany({ where: { id: { in: productIds }, tenantId }, include: { prices: true } }),
      spaceId
        ? this.pricing.getSpaceScopedLatestPrices(tenantId, spaceId, productIds)
        : this.pricing.getLatestSalesPrices(tenantId, productIds, {}),
      this.prisma.menuItem.findMany({
        where: { tenantId, deletedAt: null, id: { in: menuItemIds } },
        select: { id: true, basePrice: true, vatRate: true },
      }),
      spaceId
        ? this.prisma.spaceMenuItem.findMany({
            where: { spaceId, menuItemId: { in: menuItemIds } },
            select: { menuItemId: true, priceTtc: true, vatRate: true },
          })
        : Promise.resolve([] as Array<{ menuItemId: string; priceTtc: any; vatRate: any }>),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const itemById = new Map(menuItems.map((m) => [m.id, m]));
    const linkByItem = new Map(links.map((l) => [l.menuItemId, l]));
    // Prix « courant » par article au fil du lot (gère plusieurs pairs sur le même item).
    const workingPrice = new Map<string, { ttc: number; vatRate: number | null }>();

    const writes: any[] = [];
    let changed = 0;
    for (const { menuItemId, productId, override } of pairs) {
      const product = productById.get(productId);
      const current = itemById.get(menuItemId);
      if (!product || !current) {
        results.push({ menuItemId, changed: false, error: 'Article ou produit introuvable' });
        continue;
      }
      // Prix hérité = prix affiché envoyé par le front (override) sinon repli global.
      const resolved = override?.basePrice != null && Number.isFinite(Number(override.basePrice))
        ? {
            basePrice: this.menuItemSupportService.toNumber(override.basePrice),
            vatRate: override.vatRate != null ? this.menuItemSupportService.toNumber(override.vatRate) : null,
            currency: null as string | null,
            source: 'weezevent_catalog' as 'weezevent_catalog' | 'weezevent_sales',
          }
        : this.pricing.resolveWeezeventApplyPrice(product, latest.get(productId));
      if (!resolved) {
        results.push({ menuItemId, changed: false, error: 'Aucun prix Weezevent disponible (ni ventes, ni catalogue)' });
        continue;
      }

      if (spaceId) {
        // PRIX PAR ESPACE : upsert SpaceMenuItem (basePrice intouché = défaut/fallback ;
        // l'association est créée si absente, comme en apply unitaire).
        const link = linkByItem.get(menuItemId);
        const previous =
          workingPrice.get(menuItemId) ??
          (link?.priceTtc != null
            ? { ttc: this.menuItemSupportService.toNumber(link.priceTtc), vatRate: link.vatRate != null ? this.menuItemSupportService.toNumber(link.vatRate) : null }
            : null);
        const next = { ttc: resolved.basePrice, vatRate: resolved.vatRate ?? null };
        if (previous != null && previous.ttc === next.ttc && (previous.vatRate ?? null) === next.vatRate) {
          results.push({ menuItemId, changed: false, applied: resolved });
          continue;
        }
        workingPrice.set(menuItemId, next);
        writes.push(
          this.prisma.menuItemPriceHistory.create({
            data: {
              menuItemId,
              tenantId,
              spaceId,
              basePrice: resolved.basePrice,
              vatRate: resolved.vatRate,
              currency: resolved.currency,
              source: resolved.source,
              weezeventProductId: productId,
              observedAt: new Date(),
            },
          }),
          this.prisma.spaceMenuItem.upsert({
            where: { menuItemId_spaceId: { menuItemId, spaceId } },
            create: { menuItemId, spaceId, priceTtc: next.ttc, vatRate: next.vatRate },
            update: { priceTtc: next.ttc, vatRate: next.vatRate },
          }),
        );
        changed++;
        results.push({ menuItemId, changed: true, applied: resolved, previous });
        continue;
      }

      // Sans espace → comportement global (basePrice courant).
      const previous = {
        basePrice: this.menuItemSupportService.toNumber(current.basePrice),
        vatRate: current.vatRate != null ? this.menuItemSupportService.toNumber(current.vatRate) : null,
      };
      if (previous.basePrice === resolved.basePrice && previous.vatRate === (resolved.vatRate ?? null)) {
        results.push({ menuItemId, changed: false, applied: resolved });
        continue;
      }
      writes.push(
        this.prisma.menuItemPriceHistory.create({
          data: {
            menuItemId,
            tenantId,
            spaceId: null,
            basePrice: resolved.basePrice,
            vatRate: resolved.vatRate,
            currency: resolved.currency,
            source: resolved.source,
            weezeventProductId: productId,
            observedAt: new Date(),
          },
        }),
        this.prisma.menuItem.update({
          where: { id: menuItemId },
          data: { basePrice: resolved.basePrice, vatRate: resolved.vatRate },
        }),
      );
      changed++;
      results.push({ menuItemId, changed: true, applied: resolved, previous });
    }

    if (writes.length) {
      await this.prisma.$transaction(writes);
      await this.menuItemSupportService.listCache.invalidate(tenantId);
      this.logger.log(`Bulk-applied Weezevent price to ${changed} menu item(s) for tenant ${tenantId}${spaceId ? ` (space ${spaceId})` : ''}`);
    }
    return { total: items.length, changed, results };
  }

  /**
   * BACKFILL de masse : corrige tous les menu items mappés dont le prix par espace est absent/0.
   * Pour chaque couple (item × espace assigné), écrit le DERNIER prix de vente non nul observé
   * DANS CET ESPACE (locations mappées) — event prioritaire si fourni, repli sur l'espace (tous
   * events). Règle stricte : jamais un prix venu d'un autre espace. Un espace sans vente non nulle
   * (ou sans location mappée) est ignoré (`skippedNoSales`). Un item sans espace assigné ne peut
   * pas être tarifé par espace (`skippedNoSpace`) — il faut d'abord lui assigner un espace.
   *
   * `opts.spaceId`   → limiter le backfill à un seul espace.
   * `opts.eventId`   → event prioritaire (WeezeventEvent.id interne) ; repli sur l'espace si vide.
   * `opts.overwrite` → réécrire même les couples déjà tarifés (> 0). Défaut : false (idempotent).
   *
   * Écritures groupées par lots (transactions courtes) pour rester compatible pooler transaction.
   */
  async backfillWeezeventPrices(
    tenantId: string,
    opts: { spaceId?: string; eventId?: string; overwrite?: boolean; dryRun?: boolean } = {},
  ) {
    const { spaceId: onlySpaceId, eventId, overwrite = false, dryRun = false } = opts;
    const eventIds = eventId ? [eventId] : undefined;
    const summary = {
      dryRun,
      itemsScanned: 0,
      itemsTouched: 0,
      pairsApplied: 0,
      skippedNoSpace: 0,
      skippedNoSales: 0,
      skippedAlreadyPriced: 0,
      skippedAmbiguousMapping: 0,
    };

    // 1. Produits mappés par item (on ne tarifie que les items à mapping unique — sinon ambigu).
    const mappings = await this.prisma.productMapping.findMany({
      where: { tenantId },
      select: { menuItemId: true, salesProductId: true },
    });
    const productsByItem = new Map<string, Set<string>>();
    for (const m of mappings) {
      const s = productsByItem.get(m.menuItemId) ?? new Set<string>();
      s.add(m.salesProductId);
      productsByItem.set(m.menuItemId, s);
    }
    const menuItemIds = [...productsByItem.keys()];
    if (menuItemIds.length === 0) return summary;

    const items = await this.prisma.menuItem.findMany({
      where: { tenantId, deletedAt: null, id: { in: menuItemIds } },
      select: { id: true, spaceLinks: spaceLinksSelect },
    });

    // 2. Plan de travail : espace → [{ itemId, productId }], depuis les lignes SpaceMenuItem
    // (association + prix courant portés par la même ligne).
    const workBySpace = new Map<string, Array<{ itemId: string; productId: string }>>();
    for (const item of items) {
      summary.itemsScanned++;
      const products = productsByItem.get(item.id)!;
      if (products.size !== 1) { summary.skippedAmbiguousMapping++; continue; }
      const productId = [...products][0];
      const links = item.spaceLinks.filter((l) => !onlySpaceId || l.spaceId === onlySpaceId);
      if (links.length === 0) { summary.skippedNoSpace++; continue; }
      for (const link of links) {
        const existingTtc = link.priceTtc != null ? this.menuItemSupportService.toNumber(link.priceTtc) : null;
        if (!overwrite && existingTtc != null && existingTtc > 0) { summary.skippedAlreadyPriced++; continue; }
        const arr = workBySpace.get(link.spaceId) ?? [];
        arr.push({ itemId: item.id, productId });
        workBySpace.set(link.spaceId, arr);
      }
    }

    // 3. Résolution du prix par espace (scopé locations) + collecte des écritures.
    const writes: any[] = [];
    const touched = new Set<string>();
    for (const [sid, pairs] of workBySpace) {
      const productIds = [...new Set(pairs.map((p) => p.productId))];
      // Prix de l'espace (priorité) + repli ventes non attribuées à un autre espace (jamais cross-espace).
      const latest = await this.pricing.getSpaceScopedLatestPrices(tenantId, sid, productIds, { eventIds });
      if (eventIds) {
        // Event prioritaire : repli sans contrainte d'event pour les produits sans vente sur l'event.
        const missing = productIds.filter((pid) => !latest.has(pid));
        if (missing.length) {
          const fb = await this.pricing.getSpaceScopedLatestPrices(tenantId, sid, missing);
          for (const [k, v] of fb) latest.set(k, v);
        }
      }
      for (const { itemId, productId } of pairs) {
        const px = latest.get(productId);
        if (!px || !(px.ttc > 0)) { summary.skippedNoSales++; continue; }
        touched.add(itemId);
        writes.push(
          this.prisma.menuItemPriceHistory.create({
            data: {
              menuItemId: itemId,
              tenantId,
              spaceId: sid,
              basePrice: px.ttc,
              vatRate: px.vatRate ?? null,
              currency: null,
              source: 'weezevent_sales',
              weezeventProductId: productId,
              observedAt: new Date(),
            },
          }),
          // 4. Le prix vit sur la ligne d'association elle-même (qui existe forcément :
          // le plan de travail est construit DEPUIS ces lignes).
          this.prisma.spaceMenuItem.update({
            where: { menuItemId_spaceId: { menuItemId: itemId, spaceId: sid } },
            data: { priceTtc: this.menuItemSupportService.toNumber(px.ttc), vatRate: px.vatRate ?? null },
          }),
        );
        summary.pairsApplied++;
      }
    }
    summary.itemsTouched = touched.size;

    // 5. Écritures par lots courts (compat pooler transaction) — sauf en aperçu (dryRun).
    if (!dryRun) {
      const CHUNK = 25;
      for (let i = 0; i < writes.length; i += CHUNK) {
        await this.prisma.$transaction(writes.slice(i, i + CHUNK));
      }
      if (writes.length) await this.menuItemSupportService.listCache.invalidate(tenantId);
    }
    this.logger.log(
      `Backfill Weezevent prices${dryRun ? ' [DRY-RUN]' : ''} (tenant ${tenantId}${onlySpaceId ? `, space ${onlySpaceId}` : ''}): ` +
        `${summary.pairsApplied} prix appliqués sur ${summary.itemsTouched} items ` +
        `(noSpace=${summary.skippedNoSpace}, noSales=${summary.skippedNoSales}, ` +
        `already=${summary.skippedAlreadyPriced}, ambiguous=${summary.skippedAmbiguousMapping})`,
    );
    return summary;
  }

  /** Historique des prix d'un menu item (du plus récent au plus ancien) — courbe d'évolution. */
  async getPriceHistory(menuItemId: string, tenantId: string, user?: SpaceScopedUser) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: menuItemId, tenantId },
      select: { id: true, spaceLinks: spaceLinksSelect },
    });
    if (!item) throw new NotFoundException(`Menu item ${menuItemId} not found`);
    await this.spaceAccess.assertCanAccessAny(user, linksToSpaceIds(item.spaceLinks), ASSERT_SPACE_ACCESS_MESSAGES);
    return this.prisma.menuItemPriceHistory.findMany({
      where: { menuItemId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
