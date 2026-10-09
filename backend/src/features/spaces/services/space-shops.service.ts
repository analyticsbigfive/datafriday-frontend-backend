import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { resolveEventTransactionWindow } from '../../../shared/utils/event-window.util';
import { hasPermission, PermissionCheckableUser } from '../../../core/rbac/permission.util';
import {
  eventTimelineRows,
  firstValidSaleByElementRows,
  spaceShopDetails,
  spaceShopsPayload,
} from '../spaces.queries';
import { SpaceCacheService } from './space-cache.service';
import { SpaceCrudService } from './space-crud.service';
import { SpaceSalesScopeService } from './space-sales-scope.service';
import { StockLevelService } from '../../logistics/services/stock-level.service';

/**
 * PdV d'un espace, leur détail, statut live et inventaire live.
 */
@Injectable()
export class SpaceShopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly stockLevelService: StockLevelService,
    private readonly spaceCacheService: SpaceCacheService,
    private readonly spaceCrudService: SpaceCrudService,
    private readonly spaceSalesScopeService: SpaceSalesScopeService,
  ) {}

  /**
   * Get shop list only (no transaction data) — used by SpaceMenuView for fast initial load.
   *
   * 1 SEUL round-trip Postgres (au lieu de 3 séquentiels : espace+configs → shops → mappings)
   * via une requête brute unique (CTE + UNION ALL + json_agg). Chaque round-trip vers le
   * pooler Supabase coûte ~1-2s de latence réseau (mesuré) : sur ce endpoint, 3 étapes
   * séquentielles dominaient totalement le temps de réponse (~5-7s) alors que le volume de
   * données est minuscule (quelques shops). Le UNION ALL de 3 branches dédiées (floor /
   * forecourt / externalMerch), chacune filtrée sur SA propre FK, préserve le plan de requête
   * rapide déjà mesuré par ailleurs (cf. historique : un simple LEFT JOIN avec OR sur les 3
   * relations était ~65% plus lent côté Postgres que 3 requêtes séparées) — on obtient donc
   * le même plan d'exécution, mais en 1 aller-retour réseau au lieu de 3.
   */
  async getSpaceShops(spaceId: string, tenantId: string, configId?: string) {
    // Cache court (30s) — la clé inclut tenantId, donc un hit ne peut provenir que du même
    // tenant qui l'a écrit (isolation préservée même en cas de hit, sans revérifier
    // l'ownership en DB). configId fait partie de la clé pour ne pas mélanger le
    // cache "toutes configs" avec le cache scopé à une config.
    const cacheKey = configId
      ? `${this.spaceCacheService.SPACE_SHOPS_CACHE_KEY(tenantId, spaceId)}:${configId}`
      : this.spaceCacheService.SPACE_SHOPS_CACHE_KEY(tenantId, spaceId);
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const shopTypes = ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'];
    const configFilter = configId ? Prisma.sql`AND c.id = ${configId}` : Prisma.sql``;

    const rows = await spaceShopsPayload(this.prisma, tenantId, spaceId, configFilter, shopTypes);

    const row = rows[0];
    if (!row?.space_exists) {
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    }

    const rawShops: any[] = Array.isArray(row.shops) ? row.shops : [];
    const shops = rawShops.map((s: any) => {
      const menuItemsCount = Number(s.menuItemsCount) || 0;
      const floorLevel =
        s.floorLevel === 'forecourt' || s.floorLevel === 'externalmerch'
          ? s.floorLevel
          : s.floorLevel != null ? Number(s.floorLevel) : null;
      return {
        id: s.id,
        name: s.name,
        // Slug stable (/login/pin/:slug) — exposé au staff pour le QR code de
        // connexion invité (GuestPinBadge.vue), sans autre usage aujourd'hui.
        slug: s.slug ?? null,
        type: s.type,
        shopTypes: s.shopTypes,
        attributes: s.attributes,
        image: s.image ?? null,
        notes: s.notes ?? null,
        configId: s.configId ?? null,
        configName: s.configName ?? null,
        locationId: s.locationId ?? null,
        locationName: s.locationName ?? null,
        floorLevel,
        weezeventLocationId: s.weezeventLocationId ?? null,
        isMappedToWeezevent: !!s.isMappedToWeezevent,
        menuItemsCount,
        isOpen: menuItemsCount > 0,
      };
    });

    const result = { shops };
    await this.redis.set(cacheKey, result, { ttl: this.spaceCacheService.SPACE_SHOPS_CACHE_TTL });
    return result;
  }

  /**
   * Get shop details (granular sales data) for a space.
   * Delegates to the Supabase PostgreSQL RPC `get_space_shop_details`,
   * collapsing 8 sequential DB round-trips into a single network call (~2s → ~300ms).
   */
  async getShopDetails(
    spaceId: string,
    tenantId: string,
    page = 1,
    limit = 20,
    includeGranular = false,
    user?: PermissionCheckableUser,
  ) {
    const data = await this.getShopDetailsRaw(spaceId, tenantId, page, limit, includeGranular);
    if (user && !hasPermission(user, 'stats.financial.view')) {
      return {
        ...data,
        shops: (data.shops ?? []).map((shop: any) => this.spaceCrudService.stripFields(shop, ['revenue'])),
        shopGranularData: (data.shopGranularData ?? []).map((row: any) => this.spaceCrudService.stripFields(row, ['revenue'])),
      };
    }
    return data;
  }

  private async getShopDetailsRaw(spaceId: string, tenantId: string, page: number, limit: number, includeGranular: boolean) {
    // Cache Redis (60s) : la RPC est le poste dominant du premier rendu /analyse.
    // Une erreur (space_not_found) jette depuis la factory → rien n'est mis en cache.
    return this.redis.getOrSet(
      `${this.spaceCacheService.SPACE_SHOPDETAILS_CACHE_KEY(tenantId, spaceId)}:${page}:${limit}:${includeGranular ? 1 : 0}`,
      async () => {
        const rows = await spaceShopDetails(this.prisma, tenantId, spaceId, page, limit, includeGranular);
        const data = rows[0]?.get_space_shop_details;
        if (!data || data.__error === 'space_not_found') {
          throw new NotFoundException(`Space with ID ${spaceId} not found`);
        }
        return data;
      },
      { ttl: this.spaceCacheService.SPACE_SHOPDETAILS_CACHE_TTL },
    );
  }

  // Fenêtre de fraîcheur : au moins une vente dans les N dernières minutes (question #20 du
  // tracker front, tranchée par Ulrich 2026-07-20 : signal = vente réelle, pas le webhook brut).
  private readonly LIVE_STATUS_WINDOW_MINUTES = 30;
  // Marge après eventEndDate pendant laquelle un event reste considéré "live" (règlement tardif) —
  // même valeur que WeezeventCronService.LIVE_AGGREGATION_GRACE_HOURS (filet de sécurité BUG-109),
  // les deux implémentant la même définition d'"event en direct".
  private readonly LIVE_STATUS_GRACE_HOURS = 3;

  /**
   * "Cet espace a-t-il un event live ?" (tracker front #20, LIVE_API_GUIDE.md §1). Un espace n'a
   * qu'un seul event live à la fois (cardinalité tranchée le 2026-07-23, tracker #23) : l'event le
   * plus récent dont la fenêtre [eventStartDate, eventEndDate + grace] couvre l'instant présent est
   * live si au moins une vente réelle (non annulée, cf. BUG-108) est arrivée dans les 30 dernières
   * minutes pour les shops de cet espace.
   *
   * Si AUCUN Event ne couvre l'instant présent (pas créé à l'avance, ou oublié), ne pas se
   * refermer sur `isLive:false` par principe : une vente réelle dans la fenêtre glissante de 30
   * min suffit à elle seule à ancrer le live (`eventId:null` dans ce cas — décision revue, il
   * n'est plus nécessaire d'avoir saisi un Event en amont pour détecter un live réel).
   */
  async getLiveStatus(
    spaceId: string,
    tenantId: string,
  ): Promise<{ isLive: boolean; eventId: string | null; since: string | null }> {
    const now = new Date();
    const graceMs = this.LIVE_STATUS_GRACE_HOURS * 60 * 60 * 1000;

    // Candidats : events récents dont la fenêtre pourrait couvrir "now" — bornés à quelques
    // jours pour éviter un scan de tout l'historique (aucun event de plus de quelques jours ne
    // peut encore être dans sa fenêtre + grace).
    const candidates = await this.prisma.event.findMany({
      where: {
        tenantId,
        spaceId,
        eventDate: { lte: now, gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, eventDate: true, eventStartDate: true, eventEndDate: true, eventEndTime: true },
      orderBy: { eventDate: 'desc' },
    });

    // Fenêtre RÉELLE de l'event (minuit local du jour → heure de fin déclarée), même règle
    // que l'agrégation. Les dates d'event sont toutes à minuit UTC : l'ancien calcul
    // `eventEndDate + 3 h` fermait la fenêtre à 03:00 UTC le jour du match, aucun event
    // n'était donc rattaché pendant le match (eventId null, badge Live masqué côté écran).
    const space = candidates.length
      ? await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { timezone: true } })
      : null;
    const tz = space?.timezone || 'Europe/Paris';

    // Ne bloque plus sur l'absence d'Event : `event` peut rester `undefined` — le live sera
    // alors détecté (ou non) sur la seule base des ventes réelles, cf. doc de la méthode.
    const event = candidates.find((e) => {
      const { start, end } = resolveEventTransactionWindow(e, tz);
      return now >= start && now <= new Date(end.getTime() + graceMs);
    });
    const eventStart = event ? resolveEventTransactionWindow(event, tz).start : null;

    const [locationMapping, shopIds] = await Promise.all([
      this.prisma.locationSpaceMapping.findFirst({
        where: { tenantId, spaceId },
        select: { salesLocationId: true },
      }),
      this.spaceSalesScopeService.resolveShopIdsForSpace(spaceId, tenantId),
    ]);
    if (shopIds.length === 0) return { isLive: false, eventId: event?.id ?? null, since: null };

    const integrationId = locationMapping?.salesLocationId ?? null;
    const integrationClause = integrationId
      ? Prisma.sql`AND t."integrationId" = ${integrationId}`
      : Prisma.sql``;
    // Même repli "unmapped = gardé" que getEventTimelineBatch (§ ci-dessus) — un PdV pas encore
    // mappé shop-level ne doit pas faire manquer un vrai signal live.
    const shopScopeClause = integrationId
      ? Prisma.sql`(mem."spaceElementId" IS NULL OR mem."spaceElementId" = ANY(${shopIds}))`
      : Prisma.sql`mem."spaceElementId" = ANY(${shopIds})`;

    const windowStart = new Date(now.getTime() - this.LIVE_STATUS_WINDOW_MINUTES * 60 * 1000);
    // Avec un Event trouvé : la vente doit être à la fois récente (30 dernières minutes) ET
    // dans la fenêtre de l'event (pas une vente de test pré-event) — définition tranchée #20,
    // inchangée. Sans Event : fenêtre glissante de 30 min pure, aucun ancrage supplémentaire —
    // une vente isolée suffit, et le live retombe naturellement 30 min après la dernière vente.
    const effectiveWindowStart = eventStart && eventStart > windowStart ? eventStart : windowStart;

    const rows: { since: Date | null }[] = await eventTimelineRows(this.prisma, tenantId, integrationClause, effectiveWindowStart, shopScopeClause);

    const since = rows[0]?.since ?? null;
    return { isLive: !!since, eventId: event?.id ?? null, since: since ? since.toISOString() : null };
  }

  /**
   * Première vente validée de chaque PdV de l'espace depuis `since` (périmètre de
   * `getLiveStatus`, mais seules les ventes rattachées à un PdV comptent). Sert à
   * l'arrêt du pre-event PDV par PDV dès sa première vente, vente de test comprise
   * (retour Bertrand 2026-10-07, choix Ulrich : « on part sur 1, test ou pas »).
   */
  async firstValidSaleByElementSince(spaceId: string, tenantId: string, since: Date): Promise<Map<string, Date>> {
    const [locationMapping, shopIds] = await Promise.all([
      this.prisma.locationSpaceMapping.findFirst({
        where: { tenantId, spaceId },
        select: { salesLocationId: true },
      }),
      this.spaceSalesScopeService.resolveShopIdsForSpace(spaceId, tenantId),
    ]);
    if (shopIds.length === 0) return new Map();
    const integrationId = locationMapping?.salesLocationId ?? null;
    const integrationClause = integrationId
      ? Prisma.sql`AND t."integrationId" = ${integrationId}`
      : Prisma.sql``;
    const rows = await firstValidSaleByElementRows(this.prisma, tenantId, integrationClause, since, shopIds);
    return new Map(rows.map((r) => [r.elementId, r.firstAt]));
  }

  /**
   * Onglet Inventaire live (tracker front #22, LIVE_API_GUIDE.md §3) — délègue au module
   * Logistic, qui calcule déjà cette combinaison Restock + décrément par vente pour son propre
   * écran. Passthrough volontairement fin : la logique vit dans LogisticsService, pas ici.
   */
  async getLiveInventory(spaceId: string, tenantId: string) {
    return this.stockLevelService.getLiveInventory(spaceId, tenantId);
  }
}
