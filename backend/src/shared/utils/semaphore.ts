import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Sémaphore FIFO en mémoire process (BUG-144-01).
 *
 * Pourquoi : les 3 endpoints batch de l'Analyse matérialisent des mégaoctets de lignes SQL
 * par requête. Sans borne côté serveur, N navigateurs (ou un seul mal borné) déclenchent
 * N requêtes lourdes simultanées → OOM kill silencieux sur Render (512 Mo, « Instance
 * restarted » sans stacktrace). Ce sémaphore borne la CONCURRENCE de la section SQL :
 * `concurrency` exécutions en parallèle, `maxQueue` en attente, au-delà (ou après
 * `timeoutMs` d'attente) → 503 explicite, que le client peut réessayer — un refus visible
 * plutôt qu'un kill invisible.
 *
 * En mémoire process (pas Redis) : la limite protège LA mémoire de CE process — c'est
 * par process qu'on veut la borne, et ça reste correct avec plusieurs instances.
 */
export class Semaphore {
  private inFlight = 0;
  private readonly queue: Array<{
    resolve: () => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(
    private readonly concurrency: number,
    private readonly maxQueue: number,
    private readonly timeoutMs: number,
    private readonly label = 'semaphore',
  ) {}

  private async acquire(): Promise<void> {
    if (this.inFlight < this.concurrency) {
      this.inFlight++;
      return;
    }
    if (this.queue.length >= this.maxQueue) {
      throw new ServiceUnavailableException(
        `${this.label}: too many concurrent requests, retry shortly`,
      );
    }
    await new Promise<void>((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const i = this.queue.indexOf(entry);
          if (i >= 0) this.queue.splice(i, 1);
          reject(
            new ServiceUnavailableException(
              `${this.label}: queued too long (${this.timeoutMs} ms), retry shortly`,
            ),
          );
        }, this.timeoutMs),
      };
      this.queue.push(entry);
    });
    this.inFlight++;
  }

  private release(): void {
    this.inFlight--;
    const next = this.queue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
    }
  }

  /** Exécute `fn` sous le sémaphore — release garanti, y compris sur throw. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
