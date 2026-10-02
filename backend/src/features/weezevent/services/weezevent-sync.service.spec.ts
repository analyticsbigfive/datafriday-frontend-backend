import { WeezeventSyncService } from './weezevent-sync.service';

/** La façade ne fait que déléguer : chaque méthode doit appeler le bon sous-service. */
describe('WeezeventSyncService', () => {
    const result = { type: 'x', success: true, itemsSynced: 1, itemsCreated: 1, itemsUpdated: 0, errors: 0, duration: 1 };
    const transactionSync = { syncSingleTransaction: jest.fn().mockResolvedValue({ created: true, updated: false }) };
    const catalogSync = { syncProducts: jest.fn().mockResolvedValue(result) };
    const queuedEntitySync = {
        syncOrders: jest.fn().mockResolvedValue(result),
        syncPrices: jest.fn().mockResolvedValue(result),
        syncAttendees: jest.fn().mockResolvedValue(result),
    };
    const service = new WeezeventSyncService(transactionSync as any, catalogSync as any, queuedEntitySync as any);

    beforeEach(() => jest.clearAllMocks());

    it('transaction unique (webhook)', async () => {
        await expect(service.syncSingleTransaction('t', 'i', 42)).resolves.toEqual({ created: true, updated: false });
        expect(transactionSync.syncSingleTransaction).toHaveBeenCalledWith('t', 'i', 42);
    });

    it('produits du catalogue', async () => {
        await expect(service.syncProducts('t', 'i')).resolves.toBe(result);
        expect(catalogSync.syncProducts).toHaveBeenCalledWith('t', 'i');
    });

    it('commandes, prix et participants', async () => {
        await service.syncOrders('t', 'i', 'e');
        await service.syncPrices('t', 'i', 'e');
        await service.syncAttendees('t', 'i', 'e');
        expect(queuedEntitySync.syncOrders).toHaveBeenCalledWith('t', 'i', 'e');
        expect(queuedEntitySync.syncPrices).toHaveBeenCalledWith('t', 'i', 'e');
        expect(queuedEntitySync.syncAttendees).toHaveBeenCalledWith('t', 'i', 'e');
    });
});
