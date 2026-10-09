import { Controller, Get, Param, Query, UseGuards, Sse, MessageEvent, Inject } from '@nestjs/common';
import { Observable } from 'rxjs';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../core/redis/redis.constants';
import { liveSpaceChannel } from '../../shared/live-channel.util';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { SpaceIdParam } from '../../core/auth/decorators/space-id-param.decorator';
import { SpacesGetEventTimelineBatchQueryDto, SpacesGetTransactionBasketsBatchQueryDto } from './dto/spaces.query.dto';
import { rowsSinceMinute } from './live-delta.util';
import { SpaceEventTimelineService } from './services/space-event-timeline.service';
import { SpaceAnalyseBatchService } from './services/space-analyse-batch.service';
import { SpaceShopsService } from './services/space-shops.service';

/**
 * Analyses d'un espace : timelines d'événements, paniers, ventes non rattachées, statut et flux live, inventaire live.
 */
@ApiTags('Spaces')
@ApiBearerAuth('supabase-jwt')
@Controller('spaces')
// Ce contrôleur expose `/spaces/:id` → indique au SpaceAccessGuard que l'id d'espace
// est porté par le param `id` (et non `spaceId`).
@SpaceIdParam('id')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class SpaceAnalyticsController {
  constructor(
    private readonly spaceAnalyseBatchService: SpaceAnalyseBatchService,
    private readonly spaceShopsService: SpaceShopsService,
    private readonly spaceEventTimelineService: SpaceEventTimelineService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  /**
   * Get minute-level timeline for MULTIPLE events at once: minute × shop × menuItem.
   * Batched version of the single-event endpoint below — resolves shopIds/ownership/
   * integration scope once for the space instead of once per event.
   */
  @Get(':id/event-timeline')
  @ApiOperation({
    summary: 'Timeline minute par minute de plusieurs événements (batch)',
    description:
      'Version batchée de GET :id/event-timeline/:eventId — un seul appel pour N eventIds ' +
      'au lieu de N appels individuels. Retourne un objet { [eventId]: records[] }.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiQuery({ name: 'eventIds', required: true, description: 'IDs d\'événements séparés par des virgules (max 100)' })
  @ApiQuery({
    name: 'since',
    required: false,
    description: 'Écran Live : seulement les minutes locales >= since (« YYYY-MM-DDTHH:mm »), rafraîchissement incrémental.',
  })
  @ApiQuery({
    name: 'granularity',
    required: false,
    enum: ['minute', 'summary'],
    description:
      'BUG-364-01 : "summary" = grain event × shop × produit SANS la dimension minute (~100× plus léger) — ' +
      'le chargement de montage de l\'Analyse n\'a besoin que de totaux ; le grain minute reste servi par ' +
      'défaut (courbe horaire). Toute autre valeur = minute.',
  })
  async getEventTimelineBatch(
    @Param('id') id: string,
    @Query() params: SpacesGetEventTimelineBatchQueryDto,
    @CurrentUser() user: any,
  ) {
    const { eventIds, granularity, since } = params;
    const ids = (eventIds || '').split(',').map((s) => s.trim()).filter(Boolean);
    const byEvent = await this.spaceEventTimelineService.getEventTimelineBatch(id, ids, user.tenantId, {
      granularity: granularity === 'summary' ? 'summary' : 'minute',
    });
    return rowsSinceMinute(byEvent, since);
  }

  /**
   * Combinaisons de catégories/articles PAR TRANSACTION (panier), pour N événements.
   */
  @Get(':id/transaction-baskets')
  @ApiOperation({
    summary: 'Combinaisons de catégories/articles par transaction (batch)',
    description:
      'Répartition des paniers par ENSEMBLE de catégories (et d\'articles) achetés ensemble — ' +
      'alimente le donut « Répartition des catégories de produits par transaction ». ' +
      'Seule lecture qui préserve l\'identité du panier : GET :id/event-timeline porte la même ' +
      'jointure mais écrase t.id en COUNT(DISTINCT). ' +
      'Pré-groupé par (event × minute × PdV × combo) pour rester filtrable côté client sans refetch. ' +
      'Les remboursements sont comptés (statut V, montants négatifs) ; les lignes non résolues ' +
      '(produit non mappé ou MenuItem sans catégorie) apparaissent en null DANS le tableau, ' +
      'jamais écartées (décision JLH 2026-08-24 : comptées, affichées « Non mappées » — le volume ' +
      'est mesuré à part par GET :id/analyse-unmapped). Retourne { [eventId]: records[] }.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiQuery({ name: 'eventIds', required: true, description: 'IDs d\'événements séparés par des virgules (max 100)' })
  @ApiQuery({
    name: 'since',
    required: false,
    description: 'Écran Live : seulement les minutes locales >= since (« YYYY-MM-DDTHH:mm »), rafraîchissement incrémental.',
  })
  @ApiResponse({
    status: 200,
    description: 'Combinaisons par transaction, groupées par eventId',
    schema: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            minute:           { type: 'string', example: '19:42', description: 'Minute HH:MM (heure locale de l\'espace)' },
            minuteLocal:      { type: 'string', nullable: true, example: '2026-08-22T19:42', description: 'Minute DATÉE en heure locale de l\'espace — nécessaire pour ordonner et filtrer un event qui franchit minuit' },
            shopId:           { type: 'string', description: 'ID du SpaceElement (shop), ou locationId brut si non mappé' },
            shopName:         { type: 'string', description: 'Nom du shop' },
            shopType:         { type: 'string', nullable: true },
            shopArea:         { type: 'string', nullable: true },
            categoryCombo:    {
              type: 'array',
              items: { type: 'string', nullable: true },
              description: 'Noms ProductCategory DISTINCTS et TRIÉS du panier ; null = non résolu (produit non mappé ou MenuItem sans catégorie)',
              example: ['Bières', 'Boissons Soft'],
            },
            typeCombo:        {
              type: 'array',
              items: { type: 'string', nullable: true },
              description: 'Noms ProductType distincts et triés (parent des catégories) ; null = non résolu',
              example: ['Beverage'],
            },
            itemCombo:        {
              type: 'array',
              items: { type: 'string', nullable: true },
              description: 'Noms MenuItem distincts et triés (repli sur productName si non mappé)',
              example: ['50cl Heineken', 'Frites'],
            },
            transactionCount: { type: 'number', description: 'Nombre de PANIERS portant exactement cette combinaison' },
            quantity:         { type: 'number' },
            revenueHt:        { type: 'number' },
          },
        },
      },
    },
  })
  async getTransactionBasketsBatch(
    @Param('id') id: string,
    @Query() params: SpacesGetTransactionBasketsBatchQueryDto,
    @CurrentUser() user: any,
  ) {
    const ids = (params.eventIds || '').split(',').map((s) => s.trim()).filter(Boolean);
    const byEvent = await this.spaceAnalyseBatchService.getTransactionBasketsBatch(id, ids, user.tenantId, user);
    return rowsSinceMinute(byEvent, params.since);
  }

  /**
   * Volume NON MAPPÉ des ventes de l'Analyse (BUG-137-01) — informatif, alimente le
   * bandeau de la page. Ne filtre rien : ces ventes restent comptées, en « Non mappées ».
   */
  @Get(':id/analyse-unmapped')
  @ApiOperation({
    summary: 'Volume de ventes non mappées (informatif), par événement',
    description:
      'Lignes de vente dont le produit externe n\'a pas de WeezeventProductMapping ou dont le ' +
      'PdV n\'a pas de WeezeventLocationShopMapping vers cet espace. INFORMATIF : ces ventes ' +
      'restent comptées dans event-timeline et transaction-baskets, affichées « Non mappées » ' +
      '(décision JLH 2026-08-24). Mêmes fenêtres, même scope d\'intégration et mêmes prédicats ' +
      '(status V, deletedAt) que ces deux endpoints. Sert à distinguer « rien vendu » de ' +
      '« rien de mappé » et à pointer le travail restant en Data Integration.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiQuery({ name: 'eventIds', required: true, description: 'IDs d\'événements séparés par des virgules (max 100)' })
  @ApiResponse({
    status: 200,
    description: 'Volumes non mappés, par eventId (zéros si tout est mappé)',
    schema: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          unmappedLines:        { type: 'integer', description: 'Lignes de vente non mappées (produit OU PdV)' },
          unmappedUnits:        { type: 'number',  description: 'Unités non mappées' },
          unmappedRevenueHt:    { type: 'number',  description: 'CA HT non mappé (€)' },
          unmappedProductLines: { type: 'integer', description: 'Dont lignes au produit non mappé' },
          unmappedPosLines:     { type: 'integer', description: 'Dont lignes au PdV non mappé' },
        },
      },
    },
  })
  async getAnalyseUnmappedBatch(
    @Param('id') id: string,
    @Query('eventIds') eventIds: string,
    @CurrentUser() user: any,
  ) {
    const ids = (eventIds || '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.spaceAnalyseBatchService.getAnalyseUnmappedBatch(id, ids, user.tenantId);
  }

  /**
   * Get minute-level timeline for one event: minute × shop × menuItem
   */
  @Get(':id/event-timeline/:eventId')
  @ApiOperation({
    summary: 'Timeline minute par minute d\'un événement',
    description:
      'Retourne les transactions agrégées par minute × shop (SpaceElement) × article (MenuItem mappé) pour un événement donné. ' +
      'Source de données : WeezeventTransaction + WeezeventTransactionItem, jointure avec les mappings shop (Step 2) et menu (Step 3) du wizard. ' +
      'Produits non mappés au Step 3 sont inclus avec menuItemId = null.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement Weezevent (WeezeventEvent.id)' })
  @ApiResponse({
    status: 200,
    description: 'Enregistrements timeline (un par minute × shop × article)',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          minute:           { type: 'string', example: '19:42', description: 'Minute HH:MM (heure locale UTC)' },
          shopId:           { type: 'string', description: 'ID du SpaceElement (shop)' },
          shopName:         { type: 'string', description: 'Nom du shop' },
          shopType:         { type: 'string', nullable: true, description: 'Type du shop (fnb-food, fnb-bar…)' },
          shopArea:         { type: 'string', nullable: true, description: 'Zone du shop' },
          weezeventProductId: { type: 'string', nullable: true, description: 'ID produit Weezevent brut' },
          menuItemId:       { type: 'string', nullable: true, description: 'ID MenuItem mappé (null si produit non mappé au Step 3)' },
          menuItemName:     { type: 'string', nullable: true, description: 'Nom de l\'article' },
          menuItemType:     { type: 'string', nullable: true, description: 'Type produit (ProductType)' },
          menuItemCategory: { type: 'string', nullable: true, description: 'Catégorie produit (ProductCategory)' },
          quantity:         { type: 'integer', description: 'Quantité vendue sur cette minute' },
          transactionCount: { type: 'integer', description: 'Transactions distinctes sur cette minute' },
          revenueHt:        { type: 'number', description: 'Revenu HT (€) sur cette minute' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async getEventTimeline(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    return this.spaceEventTimelineService.getEventTimeline(id, eventId, user.tenantId);
  }

  /**
   * "Cet espace a-t-il un event live ?" — signal pour le bouton ◉ et la route Live
   * (LIVE_API_GUIDE.md §1, tracker front QUESTIONS_A_BERTRAND.md #20/#23).
   */
  @Get(':id/live-status')
  @RequirePermissions('front.fb.live')
  @ApiOperation({
    summary: 'Statut live d\'un espace',
    description:
      'Un espace a un event "live" si au moins une vente réelle (non annulée) est arrivée dans ' +
      'les 30 dernières minutes, pour un event dont la fenêtre [eventStartDate, eventEndDate] ' +
      '(+ marge de quelques heures) couvre l\'instant présent. Un espace n\'a qu\'un seul event ' +
      'live à la fois (cardinalité tranchée). Prévu pour être pollé par l\'écran Live (front).',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({
    status: 200,
    description: 'Statut live de l\'espace',
    schema: {
      type: 'object',
      properties: {
        isLive: { type: 'boolean' },
        eventId: { type: 'string', nullable: true, description: 'ID de l\'event DataFriday live (null si aucun)' },
        since: { type: 'string', format: 'date-time', nullable: true, description: 'Timestamp de la 1ère vente de la fenêtre live courante' },
      },
    },
  })
  async getLiveStatus(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.spaceShopsService.getLiveStatus(id, user.tenantId);
  }

  /**
   * Chantier 379 (frontend/docs/chantiers/379_live_standalone_backend_driven) — signal SSE
   * pour l'écran Live v2 : un message dès qu'une agrégation vient de se terminer pour cet
   * espace (AggregationProcessor::onCompleted, un seul point de publication pour les 3
   * déclencheurs existants — webhook, vente simulée, cron de secours). Le front n'a qu'à
   * refetch ses données habituelles à la réception, aucun payload métier transporté ici —
   * garde l'agrégation elle-même comme unique source de vérité, pas de calcul dupliqué.
   *
   * Connexion Redis dédiée PAR client SSE (duplicate()), fermée à la déconnexion (teardown
   * de l'Observable) — pas de fuite de listener sur la connexion partagée de RedisService.
   */
  @Sse(':id/live/stream')
  @RequirePermissions('front.fb.live')
  @ApiOperation({
    summary: 'Flux SSE — signal de rafraîchissement live',
    description:
      'Un événement "message" par agrégation terminée pour cet espace (aucune donnée métier, ' +
      'juste un signal de refetch) + un "heartbeat" toutes les 20s pour garder la connexion ' +
      'ouverte à travers d\'éventuels proxys/CDN.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  liveStream(@Param('id') spaceId: string, @CurrentUser() user: any): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const channel = liveSpaceChannel(user.tenantId, spaceId);
      const sub = this.redisClient.duplicate();

      sub.subscribe(channel).catch((err) => subscriber.error(err));
      sub.on('message', (chan: string, message: string) => {
        if (chan !== channel) return;
        try {
          subscriber.next({ data: JSON.parse(message) });
        } catch {
          // message mal formé — ignoré, pas de crash de la connexion SSE pour ça.
        }
      });
      sub.on('error', (err) => subscriber.error(err));

      const heartbeat = setInterval(() => {
        subscriber.next({ type: 'heartbeat', data: { at: new Date().toISOString() } });
      }, 20_000);

      return () => {
        clearInterval(heartbeat);
        sub.quit().catch(() => {});
      };
    });
  }

  /**
   * Onglet Inventaire live (LIVE_API_GUIDE.md §3, tracker front #22) : arbre Shop → items ET
   * Item → shops, combinant mouvements Restock + décrément par vente en temps réel — délègue au
   * module Logistic, qui calcule déjà exactement ça pour son propre écran.
   */
  @Get(':id/live/inventory')
  @RequirePermissions('front.fb.live')
  @ApiOperation({
    summary: 'Inventaire live d\'un espace',
    description:
      'Niveau de stock courant par shop et par item, combinant les mouvements de Réarmement ' +
      '(StockLevel) et le décrément par vente en temps réel depuis la dernière réconciliation ' +
      '(même calcul que GET /logistics/space/:spaceId/stock). Le "restant" affiché ' +
      '(packedUnits/looseUnits − consumedLoose) se calcule côté front, comme pour l\'écran Logistic.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({
    status: 200,
    description: 'Arbre shop→items et item→shops',
    schema: {
      type: 'object',
      properties: {
        shops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              shopId: { type: 'string' },
              shopName: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    itemKey: { type: 'string' },
                    packedUnits: { type: 'integer' },
                    looseUnits: { type: 'number' },
                    unitsPerPack: { type: 'number', nullable: true },
                    marketPriceId: { type: 'string', nullable: true },
                    consumedLoose: { type: 'number', description: 'Unités loose vendues depuis la dernière réconciliation' },
                  },
                },
              },
            },
          },
        },
        items: {
          type: 'array',
          description: 'Index inversé — mêmes données, groupées par item',
          items: {
            type: 'object',
            properties: {
              itemKey: { type: 'string' },
              shops: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
    },
  })
  async getLiveInventory(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.spaceShopsService.getLiveInventory(id, user.tenantId);
  }
}
