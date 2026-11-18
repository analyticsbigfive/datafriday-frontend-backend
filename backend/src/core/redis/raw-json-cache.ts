import { CacheOptions, RedisService } from './redis.service';

/**
 * Variante de `RedisService.getOrSet` qui manipule la chaîne JSON brute au lieu de l'objet.
 *
 * Pourquoi : `getOrSet` fait `JSON.parse` de toute la valeur en cache, puis Fastify refait
 * `JSON.stringify` du résultat pour la réponse HTTP. Sur un Node monothread, sur une grosse
 * liste servie à chaud, ces deux passes occupent la boucle d'événements et ralentissent les
 * appels concurrents. Ici la chaîne lue dans Redis est renvoyée telle quelle.
 *
 * Contrat identique à `getOrSet` : même clé, même format stocké (`JSON.stringify(valeur)`),
 * même TTL, même single-flight en cas de miss simultanés. Les entrées déjà présentes dans
 * Redis (écrites par `getOrSet`) restent lisibles, et inversement.
 *
 * Le résultat est donc la chaîne exacte que `JSON.stringify(valeur)` produit : à renvoyer
 * avec `Content-Type: application/json; charset=utf-8`, c'est octet pour octet la réponse que
 * Fastify aurait sérialisée à partir de l'objet.
 */
export class RawJsonCache {
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(private readonly redis: RedisService) {}

  async getOrSet(
    key: string,
    factory: () => Promise<unknown>,
    options: CacheOptions = {},
  ): Promise<string> {
    const cached = await this.redis.getRaw(key, options.prefix);
    if (cached !== null) {
      return cached;
    }

    const inflightKey = `${options.prefix ?? ''}${key}`;
    const pending = this.inflight.get(inflightKey);
    if (pending) {
      return pending;
    }

    // Miss : calcul unique partagé par les appelants concurrents (comme getOrSet, BUG-128-01).
    const computation = (async () => {
      const json = JSON.stringify(await factory());
      await this.redis.setRaw(key, json, options);
      return json;
    })().finally(() => {
      this.inflight.delete(inflightKey);
    });
    this.inflight.set(inflightKey, computation);

    return computation;
  }
}
