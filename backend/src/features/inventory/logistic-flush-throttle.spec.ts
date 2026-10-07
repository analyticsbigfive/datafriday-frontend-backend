import { LogisticFlushThrottle } from './logistic-flush-throttle';

describe('LogisticFlushThrottle (envoi Logistic après « Marquer compté »)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('premier envoi 2 s après le clic, les clics rapprochés partent ensemble', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const throttle = new LogisticFlushThrottle(run);
    throttle.schedule('k');
    throttle.schedule('k');
    await jest.advanceTimersByTimeAsync(1_999);
    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('au plus un envoi toutes les 10 s pour un même match', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const throttle = new LogisticFlushThrottle(run);
    throttle.schedule('k');
    await jest.advanceTimersByTimeAsync(2_000);
    throttle.schedule('k');
    await jest.advanceTimersByTimeAsync(9_999);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('les matchs ne se retardent pas entre eux', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const throttle = new LogisticFlushThrottle(run);
    throttle.schedule('a');
    throttle.schedule('b');
    await jest.advanceTimersByTimeAsync(2_000);
    expect(run.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });
});
