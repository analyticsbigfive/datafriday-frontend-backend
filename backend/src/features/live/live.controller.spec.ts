import { EventEmitter } from 'events';
import { UserRole } from '@prisma/client';
import { LiveController } from './live.controller';

/** Abonné Redis simulé : enregistre ses abonnements, émet comme ioredis. */
function fakeSubscriber() {
  const sub: any = new EventEmitter();
  sub.subscribe = jest.fn().mockResolvedValue(1);
  sub.psubscribe = jest.fn().mockResolvedValue(1);
  sub.quit = jest.fn().mockResolvedValue('OK');
  return sub;
}

const flush = () => new Promise((r) => setImmediate(r));

describe('LiveController /live/stream', () => {
  const base = { id: 'u1', tenantId: 't1' } as any;
  let sub: any;
  let controller: LiveController;
  let spaceAccess: any;

  beforeEach(() => {
    sub = fakeSubscriber();
    spaceAccess = { getAccessibleSpaceIds: jest.fn().mockResolvedValue(['s1']) };
    controller = new LiveController({ duplicate: () => sub } as any, spaceAccess);
  });

  it('sans permission live : notifications seulement, aucun abonnement aux espaces', async () => {
    const events: any[] = [];
    const s = controller.liveStream({ ...base, role: { systemKey: UserRole.VIEWER, permissions: [] } }).subscribe((e) => events.push(e));
    await flush();
    expect(sub.subscribe).toHaveBeenCalledWith('notif:tenant:t1:user:u1');
    expect(sub.psubscribe).not.toHaveBeenCalled();
    expect(spaceAccess.getAccessibleSpaceIds).not.toHaveBeenCalled();
    sub.emit('message', 'notif:tenant:t1:user:u1', JSON.stringify({ at: 'x' }));
    expect(events).toEqual([{ data: { kind: 'notification', at: 'x' } }]);
    s.unsubscribe();
  });

  it('avec permission live : espaces accessibles seulement, plus les notifications', async () => {
    const events: any[] = [];
    const s = controller
      .liveStream({ ...base, role: { systemKey: UserRole.VIEWER, permissions: ['front.fb.live'] } })
      .subscribe((e) => events.push(e));
    await flush();
    expect(sub.psubscribe).toHaveBeenCalledWith('live:tenant:t1:space:*');
    sub.emit('pmessage', 'p', 'c', JSON.stringify({ spaceId: 's2', at: 'a' }));
    sub.emit('pmessage', 'p', 'c', JSON.stringify({ spaceId: 's1', at: 'b' }));
    expect(events).toEqual([{ data: { spaceId: 's1', at: 'b' } }]);
    s.unsubscribe();
    expect(sub.quit).toHaveBeenCalled();
  });
});
