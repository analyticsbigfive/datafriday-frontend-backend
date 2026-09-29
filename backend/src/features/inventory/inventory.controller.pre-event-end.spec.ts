import { InventoryController } from './inventory.controller';

/**
 * Critère "Comptage terminé" (staff connecté, mobile / tablette) : quand tous les
 * articles d'un PDV sont comptés, l'écran appelle ce endpoint et le serveur régénère LA
 * feuille pre-event du match, et recale Logistic seulement avant l'ouverture des portes
 * (PreEventInventoryFlowService.regenerateOnPdvComplete, testé dans
 * pre-event-inventory-flow.bertrand-rules.spec.ts).
 */
describe('InventoryController.regeneratePreEventReconciliation (PDV complet, staff)', () => {
    const preEventFlow = { regenerateOnPdvComplete: jest.fn().mockResolvedValue({ ok: true, reconciliationId: 'reco-1', lineCount: 12 }) };
    const controller = new InventoryController({} as any, preEventFlow as any);
    const user = { id: 'user-1', tenantId: 'tenant-1' };

    beforeEach(() => jest.clearAllMocks());

    it("délègue au flux pre-event avec le trigger 'pdv-complete' et le PDV concerné", async () => {
        const result = await controller.regeneratePreEventReconciliation('space-1', { eventId: 'event-1', elementId: 'shop-1' } as any, user);
        expect(result).toEqual({ ok: true, reconciliationId: 'reco-1', lineCount: 12 });
        // Le flux décide s'il pousse Logistic (avant les portes) ou seulement la feuille (après).
        expect(preEventFlow.regenerateOnPdvComplete).toHaveBeenCalledWith('space-1', 'event-1', 'tenant-1', 'user-1', 'shop-1');
    });

    it('sans PDV explicite : régénération du match entier', async () => {
        await controller.regeneratePreEventReconciliation('space-1', { eventId: 'event-1' } as any, user);
        expect(preEventFlow.regenerateOnPdvComplete).toHaveBeenCalledWith('space-1', 'event-1', 'tenant-1', 'user-1', undefined);
    });
});
