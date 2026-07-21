import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventClientService } from './weezevent-client.service';
import { WeezeventApiService } from './weezevent-api.service';

describe('WeezeventClientService', () => {
    let service: WeezeventClientService;
    let apiService: WeezeventApiService;

    const mockApiService = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventClientService,
                {
                    provide: WeezeventApiService,
                    useValue: mockApiService,
                },
            ],
        }).compile();

        service = module.get<WeezeventClientService>(WeezeventClientService);
        apiService = module.get<WeezeventApiService>(WeezeventApiService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const tenantId = 'tenant-123';
    const integrationId = 'integration-a';
    const organizationId = '456';

    describe('getTransactions', () => {
        it('should fetch transactions with default pagination', async () => {
            const mockResponse = {
                data: [],
                meta: { current_page: 1, per_page: 50, total: 0, total_pages: 0 },
            };

            mockApiService.get.mockResolvedValue(mockResponse);

            const result = await service.getTransactions(tenantId, integrationId, organizationId);

            expect(result).toEqual(mockResponse);
            expect(mockApiService.get).toHaveBeenCalledWith(
                tenantId,
                integrationId,
                `/organizations/${organizationId}/transactions`,
                { page: 1, per_page: 50 },
            );
        });

        it('should apply filters correctly', async () => {
            mockApiService.get.mockResolvedValue({ data: [], meta: {} });

            await service.getTransactions(tenantId, integrationId, organizationId, {
                page: 2,
                perPage: 100,
                status: 'V',
                fromDate: new Date('2024-01-01'),
                toDate: new Date('2024-12-31'),
                eventId: 123,
            });

            expect(mockApiService.get).toHaveBeenCalledWith(
                tenantId,
                integrationId,
                `/organizations/${organizationId}/transactions`,
                expect.objectContaining({
                    page: 2,
                    per_page: 100,
                    status: 'V',
                    created_at__gte: '2024-01-01T00:00:00.000Z',
                    created_at__lte: '2024-12-31T00:00:00.000Z',
                    event_id: 123,
                }),
            );
        });

        // BUG-025 (corrigé) : integrationId doit être propagé jusqu'à WeezeventApiService.get,
        // pas seulement organizationId — c'est lui qui permet de résoudre le bon token OAuth.
        it('propagates integrationId (not just organizationId) down to WeezeventApiService', async () => {
            mockApiService.get.mockResolvedValue({ data: [], meta: {} });

            await service.getTransactions(tenantId, 'integration-b', organizationId);

            expect(mockApiService.get).toHaveBeenCalledWith(
                tenantId,
                'integration-b',
                expect.any(String),
                expect.any(Object),
            );
        });
    });

    describe('getTransaction', () => {
        it('should fetch single transaction', async () => {
            const transactionId = '789';
            const mockTransaction = {
                id: 789,
                event_name: 'Test Event',
                status: 'V',
            };

            mockApiService.get.mockResolvedValue(mockTransaction);

            const result = await service.getTransaction(
                tenantId,
                integrationId,
                organizationId,
                transactionId,
            );

            expect(result).toEqual(mockTransaction);
            expect(mockApiService.get).toHaveBeenCalledWith(
                tenantId,
                integrationId,
                `/organizations/${organizationId}/transactions/${transactionId}`,
            );
        });
    });

    describe('getWallet', () => {
        it('should fetch wallet information', async () => {
            const walletId = '123';
            const mockWallet = {
                id: 123,
                balance: 5000,
                user_id: 456,
            };

            mockApiService.get.mockResolvedValue(mockWallet);

            const result = await service.getWallet(
                tenantId,
                integrationId,
                organizationId,
                walletId,
            );

            expect(result).toEqual(mockWallet);
            expect(mockApiService.get).toHaveBeenCalledWith(
                tenantId,
                integrationId,
                `/organizations/${organizationId}/wallets/${walletId}`,
            );
        });
    });

    describe('getWallets', () => {
        it('should fetch wallets with filters', async () => {
            mockApiService.get.mockResolvedValue({ data: [], meta: {} });

            await service.getWallets(tenantId, integrationId, organizationId, {
                page: 1,
                perPage: 20,
                status: 'active',
                userId: 789,
            });

            expect(mockApiService.get).toHaveBeenCalledWith(
                tenantId,
                integrationId,
                `/organizations/${organizationId}/wallets`,
                {
                    page: 1,
                    per_page: 20,
                    status: 'active',
                    user_id: 789,
                },
            );
        });
    });

    describe('getUser', () => {
        it('should fetch user information', async () => {
            const userId = '456';
            const mockUser = {
                id: 456,
                email: 'test@example.com',
                first_name: 'John',
                last_name: 'Doe',
            };

            mockApiService.get.mockResolvedValue(mockUser);

            const result = await service.getUser(tenantId, integrationId, organizationId, userId);

            expect(result).toEqual(mockUser);
            expect(mockApiService.get).toHaveBeenCalledWith(
                tenantId,
                integrationId,
                `/organizations/${organizationId}/users/${userId}`,
            );
        });
    });

    describe('getEvent', () => {
        it('should fetch event information', async () => {
            const eventId = '1';
            const mockEvent = {
                id: 1,
                name: 'Music Festival',
                start_date: '2024-06-01',
            };

            mockApiService.get.mockResolvedValue(mockEvent);

            const result = await service.getEvent(tenantId, integrationId, organizationId, eventId);

            expect(result).toEqual(mockEvent);
            expect(mockApiService.get).toHaveBeenCalledWith(
                tenantId,
                integrationId,
                `/organizations/${organizationId}/events/${eventId}`,
            );
        });
    });

    describe('getEvents', () => {
        it('should fetch events list', async () => {
            mockApiService.get.mockResolvedValue({ data: [], meta: {} });

            await service.getEvents(tenantId, integrationId, organizationId, {
                page: 1,
                perPage: 10,
            });

            expect(mockApiService.get).toHaveBeenCalledWith(
                tenantId,
                integrationId,
                `/organizations/${organizationId}/events`,
                { page: 1, per_page: 10 },
            );
        });
    });

    describe('getProduct', () => {
        it('should fetch product information', async () => {
            const productId = '5';
            const mockProduct = {
                id: 5,
                name: 'Burger Deluxe',
                base_price: 500,
            };

            mockApiService.get.mockResolvedValue(mockProduct);

            const result = await service.getProduct(
                tenantId,
                integrationId,
                organizationId,
                productId,
            );

            expect(result).toEqual(mockProduct);
            expect(mockApiService.get).toHaveBeenCalledWith(
                tenantId,
                integrationId,
                `/organizations/${organizationId}/products/${productId}`,
            );
        });
    });

    describe('getProducts', () => {
        it('should fetch products with category filter', async () => {
            mockApiService.get.mockResolvedValue({ data: [], meta: {} });

            await service.getProducts(tenantId, integrationId, organizationId, {
                page: 1,
                perPage: 50,
                category: 'food',
            });

            expect(mockApiService.get).toHaveBeenCalledWith(
                tenantId,
                integrationId,
                `/organizations/${organizationId}/products`,
                {
                    page: 1,
                    per_page: 50,
                    category: 'food',
                },
            );
        });
    });
});
