import { alignPastMinute } from '@/composables/usePredictiveTimeline';
import { calculateSimilarity } from '@/utils/predictiveAnalytics';

const min = (h, m) => h * 60 + m;

describe('alignement horaire de la timeline prédictive', () => {
  it('futur 20:00, passé 18:30 → vente à 18:45 apparaît à 20:15', () => {
    const timeOffset = min(20, 0) - min(18, 30); // +90
    expect(alignPastMinute(min(18, 45), timeOffset)).toBe('20:15');
  });

  it('modulo 1440 : dépassement après minuit se replie sur la journée', () => {
    // Passé 20:00, futur 23:30 → offset +210 ; vente à 23:00 → 02:30 (pas 26:30)
    const timeOffset = min(23, 30) - min(20, 0);
    expect(alignPastMinute(min(23, 0), timeOffset)).toBe('02:30');
  });

  it('modulo 1440 : offset négatif ne produit pas de minute négative', () => {
    // Futur 14:00, passé 20:00 → offset -360 ; vente à 01:00 → 19:00
    const timeOffset = min(14, 0) - min(20, 0);
    expect(alignPastMinute(min(1, 0), timeOffset)).toBe('19:00');
  });
});

describe('affluence scoring : scanned d’abord, fallback sold', () => {
  const base = {
    eventDate: '15/03/2025',
    eventType: 'Concert',
    category: 'Musique',
  };

  it('le scoring utilise ticketsScanned en priorité (même ratio que la timeline)', () => {
    const target = { ...base, id: 't', eventDate: '20/12/2026', ticketsSold: 5000, ticketsScanned: 1000 };
    const past = { ...base, id: 'p', ticketsSold: 5000, ticketsScanned: 1000 };
    // scanned/scanned = ratio 1 → dans la fenêtre ±40% → pas exclu
    const r = calculateSimilarity(target, past);
    expect(r).not.toBeNull();

    // Si sold primait côté cible : 5000 vs scanned passé 900 → hors ±40% → exclu.
    // Avec scanned d'abord : 1000 vs 900 → dans la fenêtre.
    const past2 = { ...base, id: 'p2', ticketsSold: 0, ticketsScanned: 900 };
    expect(calculateSimilarity(target, past2)).not.toBeNull();
  });

  it('fallback sur ticketsSold quand scanned absent', () => {
    const target = { ...base, id: 't', eventDate: '20/12/2026', ticketsSold: 1000 };
    const past = { ...base, id: 'p', ticketsSold: 2000 }; // 2× → hors ±40%
    expect(calculateSimilarity(target, past)).toBeNull();
  });
});
