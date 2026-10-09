import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { buildSalesPriceAggDeltas, SalesPriceAggDeltaSource } from './sales-price-agg-delta';
import {
  deletePriceAggForIntegration,
  purgeEmptyPriceAgg,
  rebuildPriceAggForIntegration,
  upsertPriceAggDeltas,
} from './sales-price-agg.queries';

/**
 * Écriture de SalesPriceAgg (BUG-337-02, docs/bugs/) — pré-agrégat lu par les méthodes
 * getLatestSalesPrices/getModalSalesPrices de MenuItemPricingService à la place du raw JOIN
 * WeezeventTransactionItem/WeezeventTransaction (17-40s mesurés sur un tenant réel).
 *
 * Deux stratégies, choisies par l'appelant selon le volume :
 *  - applyDelta : incrémental, O(lignes écrites). L'appelant connaît exactement les items qu'il
 *    vient d'insérer (et de supprimer en cas de ré-émission), on upsert +n/-n sur salesCount
 *    sans relire l'historique. Pour le steady-state (webhook, sync incrémental, Digifood).
 *    Remplace l'ancien refreshForKeys (delete+recompute "ciblé") qui, pour 2 clés, rejoignait
 *    TOUTES les transactions de la location (72k tx, ~200k lectures aléatoires sur la table
 *    items de 3,5 GB) : lancé N fois en parallèle par les webhooks, il saturait le disque
 *    (85 % IOwait mesuré en prod le 2026-09-21).
 *  - refreshForIntegration : recalcul complet d'une intégration (même coût que l'ancienne requête,
 *    mais payé UNE fois par job de sync au lieu d'une fois par page vue), réservé au premier sync
 *    complet, au backfill, et à la fin d'un job de sync massif. Corrige aussi toute dérive du
 *    delta (suppressions hors flux, changements de statut).
 *
 * Les deux omettent volontairement les filtres status/deletedAt — les requêtes raw remplacées
 * dans menu-item-pricing.service.ts ne les avaient pas non plus ; les ajouter changerait le
 * comportement en silence.
 */
@Injectable()
export class SalesPriceAggService {
  private readonly logger = new Logger(SalesPriceAggService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert incrémental : +1 par item ajouté, -1 par item supprimé, par clé SalesPriceAgg.
   * Une seule requête INSERT ... ON CONFLICT DO UPDATE, aucun scan de l'historique. Les lignes
   * dont le compteur tombe à 0 ou moins sont purgées (clé indexée tenant+location, table petite).
   * Ne doit jamais faire échouer l'appelant : catch systématique côté appelant (applyDeltaSafe).
   */
  async applyDelta(
    tenantId: string,
    integrationId: string,
    added: SalesPriceAggDeltaSource[],
    removed: SalesPriceAggDeltaSource[] = [],
  ): Promise<void> {
    const rows = buildSalesPriceAggDeltas(added, removed);
    if (!rows.length) return;

    await upsertPriceAggDeltas(this.prisma, tenantId, integrationId, rows);
    if (rows.some((r) => r.delta < 0)) {
      await purgeEmptyPriceAgg(this.prisma, tenantId, [...new Set(rows.map((r) => r.locationId))]);
    }
  }

  /**
   * Refresh complet d'une intégration : delete+recompute depuis TOUT l'historique
   * WeezeventTransactionItem/WeezeventTransaction (même coût que l'ancienne requête à la volée,
   * 20-40s sur un gros tenant). Réservé au premier sync complet, au backfill, et à la fin d'un job
   * de sync massif (bisection worker) — jamais appelé depuis un chemin de lecture HTTP.
   *
   * Pas de $transaction englobant delete+insert : garder une
   * transaction ouverte 20-40s sur un scan multi-millions de lignes risque verrous/vacuum/
   * réplication. La brève fenêtre table-vide s'auto-corrige (les lecteurs retombent sur
   * priceSource:'catalog' quelques secondes) — même arbitrage que le précédent
   * AggregationService.executeProcessEvents, qui ne wrap pas non plus ses delete+insert.
   *
   * ON CONFLICT : un webhook peut insérer une clé via applyDelta entre le DELETE et la fin de
   * l'INSERT ; sans lui, l'INSERT entier échouait sur la contrainte unique et l'intégration
   * restait vide jusqu'au prochain recalcul. GREATEST garde le compteur le plus complet.
   */
  async refreshForIntegration(tenantId: string, integrationId: string): Promise<void> {
    await deletePriceAggForIntegration(this.prisma, tenantId, integrationId);
    await rebuildPriceAggForIntegration(this.prisma, tenantId, integrationId);
  }

  /** Best-effort : log et avale l'erreur, ne doit jamais casser le flux appelant (sync/webhook). */
  async applyDeltaSafe(
    tenantId: string,
    integrationId: string,
    added: SalesPriceAggDeltaSource[],
    removed: SalesPriceAggDeltaSource[] = [],
  ): Promise<void> {
    try {
      await this.applyDelta(tenantId, integrationId, added, removed);
    } catch (err) {
      this.logger.warn(`SalesPriceAgg applyDelta failed (tenant=${tenantId}, integration=${integrationId}): ${(err as Error).message}`);
    }
  }

  /** Best-effort : log et avale l'erreur, ne doit jamais casser le flux appelant (sync/job). */
  async refreshForIntegrationSafe(tenantId: string, integrationId: string): Promise<void> {
    try {
      await this.refreshForIntegration(tenantId, integrationId);
    } catch (err) {
      this.logger.warn(`SalesPriceAgg refreshForIntegration failed (tenant=${tenantId}, integration=${integrationId}): ${(err as Error).message}`);
    }
  }
}
