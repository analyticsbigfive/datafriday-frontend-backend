import { SimulationRunProcessor } from './simulation-run.processor';

describe('SimulationRunProcessor — tick d’auto-simulation QA (11_LIVE.md)', () => {
  const mockPrisma: any = { simulationRun: { findUnique: jest.fn(), update: jest.fn() } };
  const mockLogistics: any = { getSimulableShops: jest.fn(), simulateSale: jest.fn() };
  const mockQueue: any = { removeJobScheduler: jest.fn().mockResolvedValue(true) };

  let processor: SimulationRunProcessor;

  const activeRun = {
    id: 'run-1',
    tenantId: 'tenant-1',
    spaceId: 'space-1',
    configId: null,
    realMode: true,
    status: 'active',
    startedByUserId: 'user-1',
    consecutiveErrorCount: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new SimulationRunProcessor(mockPrisma, mockLogistics, mockQueue);
  });

  it('run introuvable/pas actif → skip et retire le Job Scheduler (self-heal)', async () => {
    mockPrisma.simulationRun.findUnique.mockResolvedValue({ ...activeRun, status: 'stopped' });

    const result = await processor.process({ data: { runId: 'run-1' } } as any);

    expect(result).toEqual({ skipped: true, reason: 'run-not-active' });
    expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith('run-1');
    expect(mockLogistics.getSimulableShops).not.toHaveBeenCalled();
  });

  it('aucun PDV simulable → skip proprement, tickCount incrémenté quand même', async () => {
    mockPrisma.simulationRun.findUnique.mockResolvedValue(activeRun);
    mockLogistics.getSimulableShops.mockResolvedValue([]);

    const result = await processor.process({ data: { runId: 'run-1' } } as any);

    expect(result).toEqual({ skipped: true, reason: 'no-simulable-shop' });
    expect(mockPrisma.simulationRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({ lastTickStatus: 'skipped', tickCount: { increment: 1 } }),
    });
    expect(mockLogistics.simulateSale).not.toHaveBeenCalled();
  });

  it('tick réussi → appelle simulateSale avec ensureLiveEvent=true et le runId, met à jour le run', async () => {
    mockPrisma.simulationRun.findUnique.mockResolvedValue(activeRun);
    mockLogistics.getSimulableShops.mockResolvedValue([{ id: 'shop-1', name: 'Buvette', menuItemIds: ['mi-1'] }]);
    mockLogistics.simulateSale.mockResolvedValue({ transactionId: 'tx-1', elementName: 'Buvette' });

    const result = await processor.process({ data: { runId: 'run-1' } } as any);

    expect(mockLogistics.simulateSale).toHaveBeenCalledWith(
      'space-1', 'shop-1', [{ menuItemId: 'mi-1', quantity: 1 }],
      'tenant-1', 'user-1', true, true, 'run-1',
    );
    expect(result).toEqual({ transactionId: 'tx-1' });
    expect(mockPrisma.simulationRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({ lastTickStatus: 'ok', consecutiveErrorCount: 0, lastTransactionId: 'tx-1' }),
    });
  });

  it('simulateSale échoue → jamais de throw, erreur avalée et comptabilisée', async () => {
    mockPrisma.simulationRun.findUnique.mockResolvedValue(activeRun);
    mockLogistics.getSimulableShops.mockResolvedValue([{ id: 'shop-1', name: 'Buvette', menuItemIds: ['mi-1'] }]);
    mockLogistics.simulateSale.mockRejectedValue(new Error('stock insuffisant'));

    const result = await expect(processor.process({ data: { runId: 'run-1' } } as any)).resolves.toEqual({
      error: 'stock insuffisant',
    });

    expect(mockPrisma.simulationRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({ lastTickStatus: 'error', consecutiveErrorCount: 1, errorCount: { increment: 1 } }),
    });
    expect(mockQueue.removeJobScheduler).not.toHaveBeenCalled();
  });

  it('10e échec consécutif → auto-stop : status=failed + retrait du Job Scheduler', async () => {
    mockPrisma.simulationRun.findUnique.mockResolvedValue({ ...activeRun, consecutiveErrorCount: 9 });
    mockLogistics.getSimulableShops.mockResolvedValue([{ id: 'shop-1', name: 'Buvette', menuItemIds: ['mi-1'] }]);
    mockLogistics.simulateSale.mockRejectedValue(new Error('stock insuffisant'));

    await processor.process({ data: { runId: 'run-1' } } as any);

    expect(mockPrisma.simulationRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({ consecutiveErrorCount: 10, status: 'failed' }),
    });
    expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith('run-1');
  });
});
