import 'reflect-metadata';
import { AppModule } from './app.module';

/**
 * Un cycle d'imports entre fichiers *.module.ts laisse un module `undefined` dans le tableau
 * `imports` d'un autre : Nest refuse alors de démarrer (« The module at index [n] of the X
 * "imports" array is undefined »). C'est arrivé du 03/11 au 04/11 (Events -> Aggregation fermait
 * le cycle Weezevent -> Events -> Aggregation -> Mappings -> Spaces -> Weezevent) et Render
 * gardait l'ancienne version sans erreur visible côté application.
 * Ce test parcourt le graphe depuis AppModule, dans l'ordre de chargement réel de main.ts.
 */
describe('Graphe des modules Nest', () => {
  it("aucun module importé n'est undefined", () => {
    const broken: string[] = [];
    const seen = new Set<unknown>();
    const walk = (mod: any, path: string[]) => {
      const target = mod?.forwardRef ? mod.forwardRef() : mod?.module ?? mod;
      if (!target || seen.has(target)) return;
      seen.add(target);
      const imports: unknown[] = Reflect.getMetadata('imports', target) ?? [];
      imports.forEach((child: any, index) => {
        const name = target.name ?? String(target);
        if (child === undefined) broken.push(`${[...path, name].join(' -> ')} : imports[${index}] undefined`);
        else walk(child, [...path, name]);
      });
    };
    walk(AppModule, []);
    expect(broken).toEqual([]);
  });
});
