import { WeezeventAnalyticsController } from './weezevent-analytics.controller';
import { WeezeventSalesAnalyticsService } from './services/weezevent-sales-analytics.service';

/**
 * Le contrôleur délègue ; l'agrégation SQL est vérifiée sur base réelle dans
 * services/weezevent-sales-analytics.integration.spec.ts. Ici : délégation et période exigée.
 */
describe('WeezeventAnalyticsController', () => {
    const user = { id: 'user-123', tenantId: 'tenant-123' };
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const service = new WeezeventSalesAnalyticsService(prisma as any);
    const controller = new WeezeventAnalyticsController(service);
    const PERIOD = { fromDate: '2026-01-01', toDate: '2026-12-31' };

    beforeEach(() => jest.clearAllMocks());

    it('renvoie des listes vides sans ventes, une requête SQL par analyse', async () => {
        await expect(controller.getSalesByProduct(user, PERIOD)).resolves.toMatchObject({ data: [], meta: { total: 0 } });
        await expect(controller.getSalesByEvent(user, PERIOD)).resolves.toMatchObject({ data: [], meta: { total: 0 } });
        await expect(controller.getTopProducts(user, PERIOD)).resolves.toMatchObject({ data: [], meta: { total: 0, limit: 10 } });
        const margin = await controller.getMarginAnalysis(user, PERIOD);
        expect(margin.summary).toMatchObject({ totalSales: 0, totalCost: 0, mappingRate: 0, marginWarning: null });
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
    });

    it('un eventId suffit, sans période', async () => {
        await expect(controller.getSalesByProduct(user, { eventId: 'ev-1' })).resolves.toMatchObject({ meta: { eventId: 'ev-1' } });
    });

    it('refuse une analyse sans eventId ni période', async () => {
        await expect(controller.getSalesByEvent(user, {})).rejects.toThrow('fromDate et toDate sont requis');
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('refuse une période de plus de 366 jours ou inversée', async () => {
        await expect(controller.getSalesByProduct(user, { fromDate: '2024-01-01', toDate: '2026-01-01' })).rejects.toThrow('Période invalide');
        await expect(controller.getSalesByProduct(user, { fromDate: '2026-02-01', toDate: '2026-01-01' })).rejects.toThrow('Période invalide');
    });
});
