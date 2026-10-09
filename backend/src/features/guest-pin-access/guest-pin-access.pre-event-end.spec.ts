import { createGuestPinAccessServices } from './services/guest-pin-access-services.testing';
import { GuestPinCountingService } from './services/guest-pin-counting.service';
import { GuestPinSessionService } from './services/guest-pin-session.service';

/**
 * Critères d'acceptation Pre-event Inventory "Fin de l'inventaire" (invité) :
 *  - Comptage terminé : PDV complet → feuille pre-event régénérée + Logistic (via regenerate).
 *  - Doors Open : fenêtre clôturée → les liens QR n'ouvrent plus rien, ni avant saisie
 *    (getPublicContext) ni au login.
 */
describe('GuestPinSessionService et GuestPinCountingService : fin de l\'inventaire pre-event (invité)', () => {
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
    let session: GuestPinSessionService;
    let counting: GuestPinCountingService;

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
        preEventFlow = { regenerateOnPdvComplete: jest.fn().mockResolvedValue({ ok: true, reconciliationId: 'reco-1', lineCount: 3 }) };
        redis = { get: jest.fn().mockResolvedValue(0), ttl: jest.fn().mockResolvedValue(0), set: jest.fn(), incr: jest.fn() };
        ({ guestPinSessionService: session, guestPinCountingService: counting } = createGuestPinAccessServices({
            prisma,
            redis,
            preEventFlow,
        }));
    });

    describe('Comptage terminé (PDV complet)', () => {
        it('délègue au flux PDV complet (feuille + Logistic avant les portes), avec le PDV en contexte', async () => {
            const result = await counting.notifyElementComplete(guest);
            expect(result).toEqual({ ok: true, reconciliationId: 'reco-1', lineCount: 3 });
            expect(preEventFlow.regenerateOnPdvComplete).toHaveBeenCalledWith(
                'space-1',
                'event-1',
                'tenant-1',
                'guest-pin:shop-1',
                'shop-1',
            );
        });

        it('sans effet en post-event', async () => {
            expect(await counting.notifyElementComplete({ ...guest, phase: 'post-event' })).toEqual({ ok: false, reason: 'not-pre-event' });
            expect(preEventFlow.regenerateOnPdvComplete).not.toHaveBeenCalled();
        });
    });

    describe('Doors Open : les liens QR ne donnent plus accès', () => {
        it("le lien QR affiche « Accès inactif » quand la fenêtre est clôturée", async () => {
            expect(await session.getPublicContext('buvette-d')).toEqual({ elementName: 'Buvette D', active: false });
        });

        it("le lien QR affiche « Accès inactif » tant qu'aucun PIN n'a été généré", async () => {
            // Une fenêtre ouverte sans PIN est filtrée par la requête (pinLookupHash not null).
            prisma.inventoryWindow.findMany.mockResolvedValue([]);
            expect(await session.getPublicContext('buvette-d')).toEqual({ elementName: 'Buvette D', active: false });
            expect(prisma.inventoryWindow.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ pinLookupHash: { not: null } }) }),
            );
        });

        it('le login est refusé (inactive) sans fenêtre ouverte, sans compter un échec de PIN', async () => {
            const result = await session.login('123456', 'device-1', '10.0.0.1', 'buvette-d');
            expect(result).toEqual({ state: 'inactive' });
            expect(redis.incr).not.toHaveBeenCalled();
        });
    });
});
