import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { WeezeventClientService } from '../weezevent-client.service';
import { MenuItemPricingService } from '../../../../shared/pricing/menu-item-pricing.service';
import { WeezeventGetProductsQueryDto } from '../../dto/weezevent.query.dto';

/**
 * Catalogue produits Weezevent : listing avec prix de vente dérivés et rafraîchissement unitaire depuis l'API.
 */
@Injectable()
export class WeezeventProductCatalogService {
    private readonly logger = new Logger(WeezeventProductCatalogService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly weezeventClient: WeezeventClientService,
        private readonly pricing: MenuItemPricingService,
    ) { }

    /**
     * Get products
     */
/**
     * Le catalogue F&B Weezevent ne porte pas de prix (price événementiel/variable) → basePrice
     * reste null. Le prix réel est dans les ventes : on renvoie ici, PAR PRODUIT, TOUS les prix
     * de vente observés (un par couple unitPrice+vat), chacun avec TTC, HT, taux de TVA et le
     * nombre de ventes, triés par fréquence décroissante (le premier = prix modal).
     * Le `unit_price` Weezevent est TTC (vérifié : payments.amount_vat = TTC − TTC/(1+vat)).
     * → HT = round2(TTC / (1 + vat/100)). Le front décide quoi afficher/utiliser (ex. HT).
     * Requête unique indexée (WeezeventTransactionItem_productId_idx, ~20ms/100 produits) ;
     * scopée par productId (déjà vérifiés côté tenant par l'appelant, le raw n'est pas CLS).
     */
    private deriveSalesPrices(tenantId: string, productIds: string[]): Promise<Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>> {
        // Source unique : prix modal partagé (réutilisé par l'application du prix aux menu items).
        // Pas de location filter ici → needsJoin=false côté getModalSalesPrices, reste le "fast
        // path" documenté (~20ms/100 produits) : tenantId transmis pour cohérence de signature,
        // sans coût (aucun JOIN déclenché par cet appel).
        return this.pricing.getModalSalesPrices(tenantId, productIds);
    }

    async getProducts(user: any, params: WeezeventGetProductsQueryDto) {
        const { page = 1, perPage = 50, integrationId, category, spaceId, onlySold, catalogSpaceId } = params;
        const tenantId = user.tenantId;
        const p = Math.max(1, parseInt(String(page), 10) || 1);
        const pp = Math.min(Math.max(1, parseInt(String(perPage), 10) || 50), 500);
        const where: any = { tenantId };
        if (integrationId) where.integrationId = integrationId;
        if (category) where.category = category;

        // Scoping léger par espace : filtre le CATALOGUE par l'intégration Weezevent de
        // cet espace (requête indexée simple), sans déclencher la cascade de prix
        // scopée-espace de la branche `spaceId` ci-dessous (coûteuse, cf. son commentaire).
        // Le prix reste dérivé du chemin rapide (deriveSalesPrices) plus bas.
        if (catalogSpaceId && !integrationId && !spaceId) {
            const mapping = await this.prisma.locationSpaceMapping.findFirst({
                where: { tenantId, spaceId: catalogSpaceId },
                select: { salesLocationId: true },
            });
            if (mapping?.salesLocationId) where.integrationId = mapping.salesLocationId;
        }

        // BUG-337-02 (docs/bugs/) : le catalogue COMPLET (pas seulement la page demandée) est
        // chargé ici, requête unique et bon marché (indexée, pas de résolution de prix). Nécessaire
        // pour que `onlySold` filtre AVANT la pagination plutôt qu'après (cf. plus bas) — sinon
        // `total`/`total_pages` restent le décompte non filtré et l'appelant est forcé de boucler
        // sur toutes les pages pour reconstituer la liste réellement vendue (c'était le cas avant ce
        // fix : voir l'ancien commentaire sur `onlySold` ci-dessous, conservé en historique de bug).
        const catalogue = await this.prisma.salesProduct.findMany({ where, orderBy: { name: 'asc' } });
        const catalogTotal = catalogue.length;

        let data: any[];
        if (spaceId) {
            // PRIX DE L'ESPACE : on IGNORE le basePrice figé du produit (non fiable : gelé par un sync)
            // et on lit les ventes DE CET ESPACE (locations mappées) — exactement comme la catégorie
            // est déduite de la nature Weezevent. basePrice = dernier prix non nul de l'espace (même
            // règle que l'apply) ; salesPrices = distribution des prix de l'espace. Aucune vente dans
            // l'espace → on ne prend JAMAIS un prix d'un autre espace (repli sur le catalogue propre).
            //
            // BUG-337-02 (suite, docs/bugs/) : les 3 niveaux de repli (par productId, par item_id
            // Weezevent, par nom) étaient enchaînés SÉQUENTIELLEMENT — chaque niveau ne tournait que
            // sur les produits encore "manquants" du niveau précédent — et chacun (`getSpaceScoped*`)
            // re-résolvait `spaceLocationIds` indépendamment (jusqu'à 4 requêtes redondantes par
            // appel). Même raisonnement que BUG-333-02 (cascade de repli location, mesuré : coût
            // dominé par le JOIN vers WeezeventTransaction, pas par la taille de la liste d'ids) :
            // les 3 niveaux sont indépendants (chacun sa propre clé de correspondance), donc résolus
            // une seule fois pour `spaceLocationIds` puis lancés en PARALLÈLE contre le catalogue
            // complet, fusionnés par priorité (productId > item_id > nom, même ordre qu'avant).
            //
            // Corrigé au passage : le niveau 2 (repli par item_id Weezevent) ne s'était JAMAIS
            // déclenché — il filtrait sur `pr.weezeventId`, un champ qui n'existe pas sur
            // `SalesProduct` (le champ Prisma est `externalId`, `@map("weezeventId")` ne renomme que
            // la colonne DB) — remplacé par `pr.externalId`.
            const spaceLocationIds = await this.pricing.resolveSpaceLocationIds(tenantId, spaceId);
            if (!spaceLocationIds.length) {
                data = catalogue.map((pr: any) => ({ ...pr, priceSource: 'catalog' }));
            } else {
                const allIds = catalogue.map((pr: any) => pr.id);
                const wids = [...new Set(catalogue.map((pr: any) => pr.externalId).filter(Boolean))];
                const names = [...new Set(catalogue.map((pr: any) => pr.name).filter(Boolean))];
                const locOpts = { locationIds: spaceLocationIds };
                const [byId, byIdDist, byWid, byWidDist, byName, byNameDist] = await Promise.all([
                    this.pricing.getLatestSalesPrices(tenantId, allIds, locOpts),
                    this.pricing.getModalSalesPrices(tenantId, allIds, locOpts),
                    wids.length
                        ? this.pricing.getLatestSalesPricesByWeezeventId(tenantId, wids, { integrationId, ...locOpts })
                        : Promise.resolve(new Map<string, { ttc: number; vatRate: number | null }>()),
                    wids.length
                        ? this.pricing.getModalSalesPricesByWeezeventId(tenantId, wids, { integrationId, ...locOpts })
                        : Promise.resolve(new Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>()),
                    names.length
                        ? this.pricing.getLatestSalesPricesByName(tenantId, names, { integrationId, ...locOpts })
                        : Promise.resolve(new Map<string, { ttc: number; vatRate: number | null }>()),
                    names.length
                        ? this.pricing.getModalSalesPricesByName(tenantId, names, { integrationId, ...locOpts })
                        : Promise.resolve(new Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>()),
                ]);
                data = catalogue.map((pr: any) => {
                    const byIdPx = byId.get(pr.id);
                    if (byIdPx && byIdPx.ttc > 0) {
                        return {
                            ...pr,
                            basePrice: byIdPx.ttc,
                            vatRate: pr.vatRate != null && Number(pr.vatRate) !== 0 ? pr.vatRate : byIdPx.vatRate,
                            priceSource: 'sales_space',
                            salesPrices: byIdDist.get(pr.id) ?? [],
                        };
                    }
                    const byWidPx = pr.externalId ? byWid.get(pr.externalId) : undefined;
                    if (byWidPx && byWidPx.ttc > 0) {
                        return {
                            ...pr,
                            basePrice: byWidPx.ttc,
                            vatRate: pr.vatRate != null && Number(pr.vatRate) !== 0 ? pr.vatRate : byWidPx.vatRate,
                            priceSource: 'sales_item',
                            salesPrices: byWidDist.get(pr.externalId) ?? [],
                        };
                    }
                    const byNamePx = pr.name ? byName.get(pr.name) : undefined;
                    if (byNamePx && byNamePx.ttc > 0) {
                        return {
                            ...pr,
                            basePrice: byNamePx.ttc,
                            vatRate: pr.vatRate != null && Number(pr.vatRate) !== 0 ? pr.vatRate : byNamePx.vatRate,
                            priceSource: 'sales_name',
                            salesPrices: byNameDist.get(pr.name) ?? [],
                        };
                    }
                    // Aucune vente attribuable (ni par id, ni par item_id, ni par nom) : prix propre.
                    return { ...pr, priceSource: 'catalog' };
                });
            }
        } else {
            // Sans espace : prix « produit » global. Un produit F&B a basePrice null ; un produit créé
            // par un sync dont la 1re vente vue était à 0 (gratuité/staff, fréquent "HAPPY HOUR") a
            // basePrice FIGÉ à 0 → il faut aussi le dériver des ventes (sinon il reste à 0 à vie).
            const needsPrice = (v: any) => v == null || Number(v) === 0;
            const productsNeedingPrice = catalogue.filter((pr: any) => needsPrice(pr.basePrice)).map((pr: any) => pr.id);
            const salesByProduct = await this.deriveSalesPrices(tenantId, productsNeedingPrice);
            data = catalogue.map((pr: any) => {
                if (!needsPrice(pr.basePrice)) return pr;
                const sales = salesByProduct.get(pr.id);
                if (!sales || sales.length === 0) return pr;
                const top = sales[0];
                return {
                    ...pr,
                    basePrice: top.ttc,
                    vatRate: pr.vatRate ?? top.vatRate,
                    priceSource: 'sales',
                    salesPrices: sales,
                };
            });
        }

        // HT direct par produit (basePrice/vatRate déjà résolus par les branches ci-dessus, quelle
        // que soit la source), évite au front de refaire la détaxation à la main. `computePricing`
        // renvoie `pricing.gross.ht: null` si aucun vatRate n'est résolu (pas de taux inventé).
        const tenantVatRate = await this.pricing.getTenantDefaultVatRate(tenantId);
        data = data.map((pr: any) => this.pricing.withPricing(pr, tenantVatRate, null));

        // onlySold : ne renvoie que les produits ayant un prix (= réellement vendus) → on retire le
        // bruit du catalogue jamais vendu. BUG-337-02 : filtré ICI, AVANT la pagination (data porte
        // déjà tout le catalogue résolu, cf. `catalogue` plus haut) — `total`/`total_pages`
        // reflètent donc le compte RÉELLEMENT vendu, une vraie pagination devient possible côté
        // appelant (plus besoin de boucler sur toutes les pages pour tout reconstituer).
        // `catalogTotal` (non filtré) reste exposé séparément pour l'UI "X produits masqués".
        if (onlySold === 'true') {
            data = data.filter((pr: any) => pr.basePrice != null && Number(pr.basePrice) > 0);
        }
        const total = data.length;
        const pageData = data.slice((p - 1) * pp, (p - 1) * pp + pp);

        return {
            data: pageData,
            meta: {
                current_page: p,
                per_page: pp,
                total,
                total_pages: Math.ceil(total / pp),
                catalogTotal,
            },
        };
    }

    /**
     * Refresh one product details.
     * Local-first: use local WeezeventProduct/rawData when possible, then try Weezevent API only
     * for missing fields. If the external API fails, return the local record instead of breaking UI.
     */
    async refreshProduct(user: any, productId: string, spaceId?: string) {
        const tenantId = user.tenantId;
        const product = await this.prisma.salesProduct.findFirst({
            where: { id: productId, tenantId },
            include: { integration: { include: { weezevent: true } } },
        });

        if (!product) {
            throw new NotFoundException(`Product ${productId} not found`);
        }

        const rawData = (product.rawData || {}) as any;
        const localData = {
            nature: product.nature ?? rawData.nature ?? null,
            subnature: product.subnature ?? rawData.subnature ?? null,
            productType: product.productType ?? rawData.type ?? null,
            basePrice: product.basePrice != null
                ? Number(product.basePrice)
                : rawData.base_price != null
                    ? Number(rawData.base_price)
                    : rawData.basePrice != null
                        ? Number(rawData.basePrice)
                        : null,
            rawData,
        };

        // Prix absent du catalogue (F&B, basePrice null) OU figé à 0 par un sync (1re vente à 0,
        // gratuité/staff, fréquent sur les "HAPPY HOUR") → on le dérive des ventes. On expose TOUS
        // les prix (salesPrices : ttc/ht/vat/salesCount) pour que le front décide ; basePrice/vatRate
        // = prix modal (rétro-compat) pour éviter le pré-remplissage à 0 à la création.
        if (localData.basePrice == null || Number(localData.basePrice) === 0) {
            if (spaceId) {
                // Prix DE L'ESPACE (avec repli « jamais un autre espace ») ; salesPrices = distribution.
                const px = (await this.pricing.getSpaceScopedLatestPrices(tenantId, spaceId, [product.id])).get(product.id);
                if (px && px.ttc > 0) {
                    localData.basePrice = px.ttc;
                    if ((product.vatRate == null || Number(product.vatRate) === 0) && px.vatRate != null) {
                        (localData as any).vatRate = px.vatRate;
                    }
                    (localData as any).salesPrices = (await this.pricing.getSpaceScopedModalPrices(tenantId, spaceId, [product.id])).get(product.id) ?? [];
                }
                // Repli par item_id Weezevent (lien le plus fiable, indépendant du FK et du nom).
                if ((localData.basePrice == null || Number(localData.basePrice) === 0) && product.externalId) {
                    const byWid = (await this.pricing.getSpaceScopedLatestPricesByWeezeventId(tenantId, spaceId, [product.externalId], { integrationId: product.integrationId })).get(product.externalId);
                    if (byWid && byWid.ttc > 0) {
                        localData.basePrice = byWid.ttc;
                        if ((product.vatRate == null || Number(product.vatRate) === 0) && byWid.vatRate != null) {
                            (localData as any).vatRate = byWid.vatRate;
                        }
                        (localData as any).salesPrices = (await this.pricing.getSpaceScopedModalPricesByWeezeventId(tenantId, spaceId, [product.externalId], { integrationId: product.integrationId })).get(product.externalId) ?? [];
                    }
                }
                // Repli par NOM : ce produit n'a pas de vente sous son id (item recréé chaque saison)
                // → on cherche le prix des ventes du même nom (scopé espace/intégration).
                if ((localData.basePrice == null || Number(localData.basePrice) === 0) && product.name) {
                    const byName = (await this.pricing.getSpaceScopedLatestPricesByName(tenantId, spaceId, [product.name], { integrationId: product.integrationId })).get(product.name);
                    if (byName && byName.ttc > 0) {
                        localData.basePrice = byName.ttc;
                        if ((product.vatRate == null || Number(product.vatRate) === 0) && byName.vatRate != null) {
                            (localData as any).vatRate = byName.vatRate;
                        }
                        (localData as any).salesPrices = (await this.pricing.getSpaceScopedModalPricesByName(tenantId, spaceId, [product.name], { integrationId: product.integrationId })).get(product.name) ?? [];
                    }
                }
            } else {
                const sales = (await this.deriveSalesPrices(tenantId, [product.id])).get(product.id);
                if (sales && sales.length > 0) {
                    const top = sales[0];
                    localData.basePrice = top.ttc;
                    if ((product.vatRate == null || Number(product.vatRate) === 0) && top.vatRate != null) {
                        (localData as any).vatRate = top.vatRate;
                    }
                    (localData as any).salesPrices = sales;
                }
            }
        }

        const hasUsefulLocalData =
            localData.basePrice != null &&
            Number(localData.basePrice) !== 0 &&
            (!!localData.nature || !!localData.subnature || !!localData.productType);

        if (hasUsefulLocalData) {
            return { ...product, ...localData, source: 'local' };
        }

        if (!product.integration?.weezevent?.organizationId) {
            return { ...product, ...localData, source: 'local', warning: 'Missing Weezevent organizationId' };
        }

        try {
            const apiProduct = await this.weezeventClient.getProduct(
                tenantId,
                product.integrationId,
                product.integration.weezevent.organizationId,
                product.externalId,
            );

            const rawCategoryId = (apiProduct as any).category_id;
            const updateData = {
                name: apiProduct.name || product.name,
                description: apiProduct.description ?? product.description,
                nature: (apiProduct as any).nature ?? product.nature,
                subnature: (apiProduct as any).subnature ?? product.subnature,
                productType: (apiProduct as any).type ?? product.productType,
                categoryId: rawCategoryId != null
                    ? String(rawCategoryId)
                    : (apiProduct as any).category != null
                        ? String((apiProduct as any).category)
                        : product.categoryId,
                basePrice: (apiProduct as any).base_price != null
                    ? (apiProduct as any).base_price
                    : product.basePrice,
                vatRate: (apiProduct as any).vat_rate != null
                    ? (apiProduct as any).vat_rate
                    : product.vatRate,
                image: (apiProduct as any).image ?? product.image,
                rawData: apiProduct as any,
                syncedAt: new Date(),
            };

            const refreshed = await this.prisma.salesProduct.update({
                where: { id: product.id },
                data: updateData,
            });

            // Le catalogue Weezevent F&B n'a pas de prix : ne JAMAIS écraser un prix déjà dérivé des
            // ventes (localData) par un null/0 catalogue. On repli sur le prix dérivé + salesPrices.
            const refreshedBase = refreshed.basePrice != null && Number(refreshed.basePrice) !== 0
                ? Number(refreshed.basePrice)
                : (localData.basePrice != null ? Number(localData.basePrice) : null);
            return {
                ...refreshed,
                basePrice: refreshedBase,
                vatRate: refreshed.vatRate != null ? Number(refreshed.vatRate) : ((localData as any).vatRate ?? null),
                ...((localData as any).salesPrices ? { salesPrices: (localData as any).salesPrices } : {}),
                source: refreshed.basePrice != null && Number(refreshed.basePrice) !== 0 ? 'weezevent' : 'sales',
            };
        } catch (error) {
            // error.message pouvait lui-même jeter si l'exception n'est pas une vraie Error
            // (ex. rejet non standard du client Weezevent) — cassant le fallback "never break
            // the UI" que ce catch est censé garantir.
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Weezevent product refresh failed for ${productId}: ${message}`);
            return { ...product, ...localData, source: 'local', warning: 'Weezevent refresh failed' };
        }
    }
}
