import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter, INTERNAL_ERROR_MESSAGE } from './all-exceptions.filter';

const run = (exception: unknown) => {
  const reply = { status: jest.fn().mockReturnThis(), send: jest.fn(), header: jest.fn() };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => ({ url: '/api/v1/x', method: 'POST', headers: {}, ip: '127.0.0.1' }),
    }),
  } as any;
  const filter = new AllExceptionsFilter();
  jest.spyOn((filter as any).logger, 'error').mockImplementation(() => undefined);
  jest.spyOn((filter as any).logger, 'warn').mockImplementation(() => undefined);
  filter.catch(exception, host);
  return { status: reply.status.mock.calls[0][0], body: reply.send.mock.calls[0][0] };
};

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('\nInvalid `prisma.x.create()` invocation: secret SQL details', {
    code,
    clientVersion: '5.22.0',
  });

describe('AllExceptionsFilter : erreurs Prisma et erreurs serveur', () => {
  it('P2002 (doublon) -> 409 sans détail Prisma', () => {
    const { status, body } = run(prismaError('P2002'));
    expect(status).toBe(409);
    expect(body.message).toBe('Cette ressource existe déjà.');
    expect(JSON.stringify(body)).not.toContain('secret SQL');
  });

  it('P2025 (introuvable) -> 404', () => {
    expect(run(prismaError('P2025')).status).toBe(404);
  });

  it('erreur inattendue -> 500 avec message générique', () => {
    const { status, body } = run(new Error('connexion refusée à db.internal:5432 (mot de passe ...)'));
    expect(status).toBe(500);
    expect(body.message).toBe(INTERNAL_ERROR_MESSAGE);
  });

  it('code Prisma inconnu -> 500 générique', () => {
    const { status, body } = run(prismaError('P1001'));
    expect(status).toBe(500);
    expect(body.message).toBe(INTERNAL_ERROR_MESSAGE);
  });

  it('erreur métier 4xx : message conservé', () => {
    const { status, body } = run(new BadRequestException('eventId is required for orders sync'));
    expect(status).toBe(400);
    expect(body.message).toBe('eventId is required for orders sync');
  });
});
