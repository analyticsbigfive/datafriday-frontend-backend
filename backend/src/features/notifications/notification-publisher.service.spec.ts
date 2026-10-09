import { NotificationPublisherService } from './notification-publisher.service';

describe('NotificationPublisherService', () => {
  it('publie un signal par utilisateur distinct, sur son canal', async () => {
    const redis = { publish: jest.fn().mockResolvedValue(undefined) };
    await new NotificationPublisherService(redis as any).signal('t1', ['u1', 'u2', 'u1', '']);
    expect(redis.publish.mock.calls.map((c) => c[0]).sort()).toEqual([
      'notif:tenant:t1:user:u1',
      'notif:tenant:t1:user:u2',
    ]);
  });

  it("un Redis en échec ne fait pas échouer l'appelant", async () => {
    const redis = { publish: jest.fn().mockRejectedValue(new Error('down')) };
    await expect(new NotificationPublisherService(redis as any).signal('t1', ['u1'])).resolves.toBeUndefined();
  });
});
