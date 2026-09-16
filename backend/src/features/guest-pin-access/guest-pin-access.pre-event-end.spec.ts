import { GuestPinAccessService } from './guest-pin-access.service';

/**
 * Critères d'acceptation Pre-event Inventory "Fin de l'inventaire" (invité) :
 *  - Comptage terminé : PDV complet → feuille pre-event régénérée + Logistic (via regenerate).
 *  - Doors Open : fenêtre clôturée → les liens QR n'ouvrent plus rien, ni avant saisie
 *    (getPublicContext) ni au login.
 */
describe('GuestPinAccessService : fin de l\'inventaire pre-event (invité)', () => {
    const guest = {
        id: 'access-1',
        type: 'guest-pin',
        tenantId: 'tenant-1',
        spaceId: 'space-1',
        elementId: 'shop-1',
        windowId: 'win-1',
        eventId: 'event-1',
        phase: 'pre-event',
    } as any;
    let prisma: any;
    let preEventFlow: any;
    let redis: any;
    let service: GuestPinAccessService;

    beforeEach(() => {
        prisma = {
            spaceElement: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'shop-1',
                    name: 'Buvette D',
                    floor: { config: { spaceId: 'space-1' } },
                }),
            },
            inventoryWindow: {
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
                findFirst: jest.fn().mockResolvedValue(null),
            },
            guestPinAccess: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
        };
        preEventFlow = { regenerate: jest.fn().mockResolvedValue({ ok: true, reconciliationId: 'reco-1', lineCount: 3 }) };
        redis = { get: jest.fn().mockResolvedValue(0), ttl: jest.fn().mockResolvedValue(0), set: jest.fn(), incr: jest.fn() };
        service = new GuestPinAccessService(
            prisma, redis, {} as any, {} as any, preEventFlow, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
        );
    });

    describe('Comptage terminé (PDV complet)', () => {
        it('régénère la feuille pre-event du match et pousse Logistic, avec le PDV en contexte', async () => {
            const result = await service.notifyElementComplete(guest);
            expect(result).toEqual({ ok: true, reconciliationId: 'reco-1', lineCount: 3 });
            expect(preEventFlow.regenerate).toHaveBeenCalledWith(
                'space-1',
                'event-1',
                'tenant-1',
                'guest-pin:shop-1',
                'pdv-complete',
                { elementId: 'shop-1' },
            );
        });

        it('sans effet en post-event', async () => {
            expect(await service.notifyElementComplete({ ...guest, phase: 'post-event' })).toEqual({ ok: false, reason: 'not-pre-event' });
            expect(preEventFlow.regenerate).not.toHaveBeenCalled();
        });
    });

    describe('Doors Open : les liens QR ne donnent plus accès', () => {
        it("le lien QR affiche « Accès inactif » quand la fenêtre est clôturée", async () => {
            expect(await service.getPublicContext('buvette-d')).toEqual({ elementName: 'Buvette D', active: false });
        });

        it("le lien QR affiche « Accès inactif » tant qu'aucun PIN n'a été généré", async () => {
            // Une fenêtre ouverte sans PIN est filtrée par la requête (pinLookupHash not null).
            prisma.inventoryWindow.findMany.mockResolvedValue([]);
            expect(await service.getPublicContext('buvette-d')).toEqual({ elementName: 'Buvette D', active: false });
            expect(prisma.inventoryWindow.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ status: 'open', pinLookupHash: { not: null } }) }),
            );
        });

        it('le login est refusé (inactive) sans fenêtre ouverte, sans compter un échec de PIN', async () => {
            const result = await service.login('123456', 'device-1', '10.0.0.1', 'buvette-d');
            expect(result).toEqual({ state: 'inactive' });
            expect(redis.incr).not.toHaveBeenCalled();
        });
    });
});
