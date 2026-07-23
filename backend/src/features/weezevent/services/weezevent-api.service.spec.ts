import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { WeezeventApiService } from './weezevent-api.service';
import { WeezeventAuthService } from './weezevent-auth.service';
import { WeezeventApiException } from '../exceptions/weezevent-api.exception';
import { WeezeventAuthException } from '../exceptions/weezevent-auth.exception';

describe('WeezeventApiService', () => {
    let service: WeezeventApiService;
    let httpService: HttpService;
    let authService: WeezeventAuthService;

    const mockHttpService = {
        axiosRef: {
            request: jest.fn(),
        },
    };

    const mockAuthService = {
        getAccessToken: jest.fn(),
        clearToken: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventApiService,
                {
                    provide: HttpService,
                    useValue: mockHttpService,
                },
                {
                    provide: WeezeventAuthService,
                    useValue: mockAuthService,
                },
            ],
        }).compile();

        service = module.get<WeezeventApiService>(WeezeventApiService);
        httpService = module.get<HttpService>(HttpService);
        authService = module.get<WeezeventAuthService>(WeezeventAuthService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('get', () => {
        const tenantId = 'tenant-123';
        const integrationId = 'integration-a';
        const endpoint = '/organizations/123/transactions';
        const mockToken = 'mock-token';

        it('should execute GET request successfully', async () => {
            mockAuthService.getAccessToken.mockResolvedValue(mockToken);
            mockHttpService.axiosRef.request.mockResolvedValue({
                data: { result: 'success' },
            });

            const result = await service.get(tenantId, integrationId, endpoint);

            expect(result).toEqual({ result: 'success' });
            expect(mockAuthService.getAccessToken).toHaveBeenCalledWith(tenantId, integrationId);
            expect(mockHttpService.axiosRef.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'GET',
                    url: `https://api.weezevent.com/pay/v1${endpoint}`,
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${mockToken}`,
                    }),
                }),
            );
        });

        it('should pass query parameters', async () => {
            mockAuthService.getAccessToken.mockResolvedValue(mockToken);
            mockHttpService.axiosRef.request.mockResolvedValue({
                data: {},
            });

            await service.get(tenantId, integrationId, endpoint, { page: 1, per_page: 50 });

            expect(mockHttpService.axiosRef.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    params: { page: 1, per_page: 50 },
                }),
            );
        });

        // BUG-025 (corrigé) : le token doit être résolu par integrationId, pas par tenantId seul —
        // deux intégrations du même tenant ne doivent jamais partager un appel getAccessToken.
        it('resolves the access token scoped to the given integration, not just the tenant', async () => {
            mockAuthService.getAccessToken.mockResolvedValue(mockToken);
            mockHttpService.axiosRef.request.mockResolvedValue({ data: {} });

            await service.get(tenantId, 'integration-b', endpoint);

            expect(mockAuthService.getAccessToken).toHaveBeenCalledWith(tenantId, 'integration-b');
            expect(mockAuthService.getAccessToken).not.toHaveBeenCalledWith(tenantId, integrationId);
        });
    });

    describe('retry logic', () => {
        const tenantId = 'tenant-123';
        const integrationId = 'integration-a';
        const endpoint = '/test';

        it('should retry on 5xx errors', async () => {
            mockAuthService.getAccessToken.mockResolvedValue('token');

            // First 2 calls fail with 500, third succeeds
            mockHttpService.axiosRef.request
                .mockRejectedValueOnce({
                    response: { status: 500, data: {} },
                })
                .mockRejectedValueOnce({
                    response: { status: 500, data: {} },
                })
                .mockResolvedValueOnce({
                    data: { success: true },
                });

            const result = await service.get(tenantId, integrationId, endpoint);

            expect(result).toEqual({ success: true });
            expect(mockHttpService.axiosRef.request).toHaveBeenCalledTimes(3);
        });

        it('should retry on 429 rate limit', async () => {
            mockAuthService.getAccessToken.mockResolvedValue('token');

            mockHttpService.axiosRef.request
                .mockRejectedValueOnce({
                    response: { status: 429, data: {} },
                })
                .mockResolvedValueOnce({
                    data: { success: true },
                });

            const result = await service.get(tenantId, integrationId, endpoint);

            expect(result).toEqual({ success: true });
            expect(mockHttpService.axiosRef.request).toHaveBeenCalledTimes(2);
        });

        it('should NOT retry on 4xx errors (except 429)', async () => {
            mockAuthService.getAccessToken.mockResolvedValue('token');

            mockHttpService.axiosRef.request.mockRejectedValue({
                response: { status: 404, data: { message: 'Not found' } },
            });

            await expect(service.get(tenantId, integrationId, endpoint)).rejects.toThrow(
                WeezeventApiException,
            );

            expect(mockHttpService.axiosRef.request).toHaveBeenCalledTimes(1);
        });

        it('should retry on network errors', async () => {
            mockAuthService.getAccessToken.mockResolvedValue('token');

            mockHttpService.axiosRef.request
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({
                    data: { success: true },
                });

            const result = await service.get(tenantId, integrationId, endpoint);

            expect(result).toEqual({ success: true });
            expect(mockHttpService.axiosRef.request).toHaveBeenCalledTimes(2);
        });

        it('should stop retrying after max attempts', async () => {
            mockAuthService.getAccessToken.mockResolvedValue('token');

            mockHttpService.axiosRef.request.mockRejectedValue({
                response: { status: 500, data: {} },
            });

            await expect(service.get(tenantId, integrationId, endpoint)).rejects.toThrow(
                WeezeventApiException,
            );

            // Should try 3 times (initial + 2 retries)
            expect(mockHttpService.axiosRef.request).toHaveBeenCalledTimes(3);
        });
    });

    describe('error mapping', () => {
        const tenantId = 'tenant-123';
        const integrationId = 'integration-a';
        const endpoint = '/test';

        beforeEach(() => {
            mockAuthService.getAccessToken.mockResolvedValue('token');
        });

        it('should map 401 to WeezeventAuthException', async () => {
            mockHttpService.axiosRef.request.mockRejectedValue({
                response: { status: 401, data: { message: 'Unauthorized' } },
            });

            await expect(service.get(tenantId, integrationId, endpoint)).rejects.toThrow(
                WeezeventAuthException,
            );

            // Should clear token on auth failure, scoped by integrationId (BUG-025)
            expect(mockAuthService.clearToken).toHaveBeenCalledWith(integrationId);
        });

        it('should map 403 to WeezeventApiException', async () => {
            mockHttpService.axiosRef.request.mockRejectedValue({
                response: { status: 403, data: { message: 'Forbidden' } },
            });

            await expect(service.get(tenantId, integrationId, endpoint)).rejects.toThrow(
                WeezeventApiException,
            );
            await expect(service.get(tenantId, integrationId, endpoint)).rejects.toThrow(
                'Access forbidden',
            );
        });

        it('should map 404 to WeezeventApiException', async () => {
            mockHttpService.axiosRef.request.mockRejectedValue({
                response: { status: 404, data: { message: 'Not found' } },
            });

            await expect(service.get(tenantId, integrationId, endpoint)).rejects.toThrow(
                'Resource not found',
            );
        });

        it('should map network errors to WeezeventApiException', async () => {
            mockHttpService.axiosRef.request.mockRejectedValue(
                new Error('Network error'),
            );

            await expect(service.get(tenantId, integrationId, endpoint)).rejects.toThrow(
                'Network error',
            );
        });
    });

    describe('HTTP methods', () => {
        const tenantId = 'tenant-123';
        const integrationId = 'integration-a';
        const endpoint = '/test';

        beforeEach(() => {
            mockAuthService.getAccessToken.mockResolvedValue('token');
            mockHttpService.axiosRef.request.mockResolvedValue({
                data: { success: true },
            });
        });

        it('should execute POST request', async () => {
            await service.post(tenantId, integrationId, endpoint, { key: 'value' });

            expect(mockHttpService.axiosRef.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'POST',
                    data: { key: 'value' },
                }),
            );
        });

        it('should execute PUT request', async () => {
            await service.put(tenantId, integrationId, endpoint, { key: 'value' });

            expect(mockHttpService.axiosRef.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'PUT',
                    data: { key: 'value' },
                }),
            );
        });

        it('should execute DELETE request', async () => {
            await service.delete(tenantId, integrationId, endpoint);

            expect(mockHttpService.axiosRef.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'DELETE',
                }),
            );
        });
    });
});
