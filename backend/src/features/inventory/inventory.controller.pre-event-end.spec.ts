import { InventoryController } from './inventory.controller';

/**
 * Critère "Comptage terminé" (staff connecté, mobile / tablette) : quand tous les
 * articles d'un PDV sont comptés, l'écran appelle ce endpoint et le serveur régénère LA
 * feuille pre-event du match + recale Logistic (PreEventInventoryFlowService.regenerate,
 * testé dans pre-event-inventory-flow.service.spec.ts).
 */
describe('InventoryController.regeneratePreEventReconciliation (PDV complet, staff)', () => {
    const preEventFlow = { regenerate: jest.fn().mockResolvedValue({ ok: true, reconciliationId: 'reco-1', lineCount: 12 }) };
    const controller = new InventoryController({} as any, preEventFlow as any);
    const user = { id: 'user-1', tenantId: 'tenant-1' };

    beforeEach(() => jest.clearAllMocks());

    it("délègue au flux pre-event avec le trigger 'pdv-complete' et le PDV concerné", async () => {
        const result = await controller.regeneratePreEventReconciliation('space-1', { eventId: 'event-1', elementId: 'shop-1' } as any, user);
        expect(result).toEqual({ ok: true, reconciliationId: 'reco-1', lineCount: 12 });
        expect(preEventFlow.regenerate).toHaveBeenCalledWith('space-1', 'event-1', 'tenant-1', 'user-1', 'pdv-complete', { elementId: 'shop-1' });
    });

    it('sans PDV explicite : régénération du match entier', async () => {
        await controller.regeneratePreEventReconciliation('space-1', { eventId: 'event-1' } as any, user);
        expect(preEventFlow.regenerate).toHaveBeenCalledWith('space-1', 'event-1', 'tenant-1', 'user-1', 'pdv-complete', {});
    });
});
