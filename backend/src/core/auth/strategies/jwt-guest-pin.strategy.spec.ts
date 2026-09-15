import { UnauthorizedException } from '@nestjs/common';
import { JwtGuestPinStrategy } from './jwt-guest-pin.strategy';

/**
 * Critère Doors Open : « l'interface pre-event n'est plus accessible avec les liens QR ».
 * Un manager DÉJÀ connecté (JWT encore valide) est rejeté dès que la fenêtre est clôturée :
 * la stratégie relit l'accès et la fenêtre en base à chaque requête.
 */
describe('JwtGuestPinStrategy.validate', () => {
    const config = { getOrThrow: jest.fn().mockReturnValue('test-secret') } as any;
    const baseAccess = {
        id: 'access-1',
        status: 'active',
        tenantId: 'tenant-1',
        spaceId: 'space-1',
        elementId: 'shop-1',
        windowId: 'win-1',
        submittedAt: null,
        validatedAt: null,
        window: { status: 'open', eventId: 'event-1', phase: 'pre-event', showExpected: false },
    };
    let prisma: any;
    let strategy: JwtGuestPinStrategy;

    beforeEach(() => {
        prisma = { guestPinAccess: { findUnique: jest.fn().mockResolvedValue(baseAccess) } };
        strategy = new JwtGuestPinStrategy(config, prisma);
    });

    it('accepte un accès actif sur une fenêtre ouverte', async () => {
        await expect(strategy.validate({ sub: 'access-1' } as any)).resolves.toMatchObject({
            id: 'access-1',
            type: 'guest-pin',
            elementId: 'shop-1',
            phase: 'pre-event',
        });
    });

    it('rejette dès que la fenêtre est clôturée (Doors Open), même avec un JWT valide', async () => {
        prisma.guestPinAccess.findUnique.mockResolvedValue({ ...baseAccess, window: { ...baseAccess.window, status: 'closed' } });
        await expect(strategy.validate({ sub: 'access-1' } as any)).rejects.toThrow(UnauthorizedException);
    });

    it('rejette un accès révoqué ou inconnu', async () => {
        prisma.guestPinAccess.findUnique.mockResolvedValue({ ...baseAccess, status: 'revoked' });
        await expect(strategy.validate({ sub: 'access-1' } as any)).rejects.toThrow(UnauthorizedException);
        prisma.guestPinAccess.findUnique.mockResolvedValue(null);
        await expect(strategy.validate({ sub: 'access-1' } as any)).rejects.toThrow(UnauthorizedException);
    });
});
