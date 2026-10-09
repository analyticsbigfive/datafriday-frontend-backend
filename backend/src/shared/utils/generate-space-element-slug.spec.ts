import { Prisma } from '@prisma/client';
import { createSpaceElementWithUniqueSlug } from './generate-space-element-slug';

const slugConflict = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test', meta: { target: ['slug'] } });

describe('createSpaceElementWithUniqueSlug', () => {
  const clientWith = (taken: string[], failures = 0) => {
    let calls = 0;
    return {
      spaceElement: {
        findMany: jest.fn().mockResolvedValue(taken.map((slug) => ({ slug }))),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          if (calls++ < failures) throw slugConflict();
          return data;
        }),
      },
    };
  };

  it('prend le slug de base quand il est libre', async () => {
    const client = clientWith([]);
    const row: any = await createSpaceElementWithUniqueSlug(client, 'Buvette Nord', (slug) => ({ slug }));
    expect(row.slug).toBe('buvette-nord');
    expect(client.spaceElement.create).toHaveBeenCalledTimes(1);
  });

  it("choisit d'emblée un suffixe libre : une seule écriture, compatible avec une transaction", async () => {
    // Duplication de zone : la copie porte le nom de l'original, dont le slug est déjà pris.
    const client = clientWith(['buvette-nord', 'buvette-nord-2']);
    const row: any = await createSpaceElementWithUniqueSlug(client, 'Buvette Nord', (slug) => ({ slug }));
    expect(row.slug).toBe('buvette-nord-3');
    expect(client.spaceElement.create).toHaveBeenCalledTimes(1);
  });

  it('retente avec le candidat libre suivant sur conflit concurrent', async () => {
    const client = clientWith(['buvette-nord'], 1);
    const row: any = await createSpaceElementWithUniqueSlug(client, 'Buvette Nord', (slug) => ({ slug }));
    expect(row.slug).toBe('buvette-nord-3');
    expect(client.spaceElement.create).toHaveBeenCalledTimes(2);
  });
});
