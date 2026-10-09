import { escapeLikePattern } from './like-pattern';

describe('escapeLikePattern', () => {
  it('échappe les jokers ILIKE et la barre oblique inverse', () => {
    expect(escapeLikePattern('Heineken 0% 33cl')).toBe('Heineken 0\\% 33cl');
    expect(escapeLikePattern('coca_zero')).toBe('coca\\_zero');
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('laisse un nom sans joker intact', () => {
    expect(escapeLikePattern('Coca-Cola CAN 33cl')).toBe('Coca-Cola CAN 33cl');
  });
});
