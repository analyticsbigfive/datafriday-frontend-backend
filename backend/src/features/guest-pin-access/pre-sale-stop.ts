/**
 * Arrêt du pre-event PDV par PDV à la première vente (retour Bertrand 2026-10-07 : « Les
 * PDVs sont désactivés automatiquement et individuellement pour un comptage pré-event dès
 * qu'une vente est enregistrée sur le PDV » ; choix Ulrich : une seule vente suffit, vente
 * de test comprise).
 *
 * Une fois par PDV et par fenêtre : le marqueur KvStore est posé à l'arrêt automatique, ET
 * à toute réouverture manuelle (▶) du PDV. Un PDV rouvert à la main n'est donc jamais
 * recoupé par ses ventes, déjà faites ou à venir : le directeur garde la main.
 */
export const PRE_SALE_STOP_ACTOR = 'system-inventory-cycle-sale';

export function preSaleStopKey(windowId: string, elementId: string): string {
  return `inventory-cycle:pre-sale:${windowId}:${elementId}`;
}
