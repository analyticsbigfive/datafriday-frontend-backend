/**
 * Cadence de l'envoi Logistic déclenché par « Marquer compté » (retour Bertrand 2026-10-07 :
 * la Logistique doit refléter le comptage en temps réel, l'envoi à la minute laissait la
 * valeur dans « Dernier comptage physique »). Chaque envoi recalcule le stock de tout
 * l'espace (LogisticsService.reset) : un envoi par clic est exclu. Compromis :
 *  - premier envoi `delayMs` après le clic (les clics rapprochés partent ensemble) ;
 *  - au plus un envoi toutes les `minIntervalMs` par clé (espace, event, phase) ;
 *  - un clic pendant l'attente ne relance rien : l'envoi programmé le prendra.
 * Mémoire du processus seulement : le cron à la minute reste le filet de sécurité
 * (redémarrage, autre instance).
 */
export class LogisticFlushThrottle {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastRunAt = new Map<string, number>();

  constructor(
    private readonly run: (key: string) => Promise<void>,
    private readonly delayMs = 2_000,
    private readonly minIntervalMs = 10_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  schedule(key: string): void {
    if (this.timers.has(key)) return;
    const sinceLast = this.now() - (this.lastRunAt.get(key) ?? -Infinity);
    const wait = Math.max(this.delayMs, this.minIntervalMs - sinceLast);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      this.lastRunAt.set(key, this.now());
      this.run(key).catch(() => undefined);
    }, wait);
    // Ne retient pas le processus à l'arrêt (le cron rattrape).
    (timer as { unref?: () => void }).unref?.();
    this.timers.set(key, timer);
  }

  /** Annule les envois programmés (arrêt du module, tests). */
  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
