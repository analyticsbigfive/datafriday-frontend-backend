import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';

/** Message renvoyé au client pour toute erreur serveur : le détail reste dans les logs. */
export const INTERNAL_ERROR_MESSAGE = 'Erreur interne du serveur';

/**
 * Erreurs Prisma « attendues » traduites en réponse HTTP : sans cela elles sortaient en 500 avec
 * le message brut de Prisma (extrait de requête, noms de colonnes) renvoyé au client.
 */
function prismaErrorToHttp(exception: unknown): HttpException | null {
  if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) return null;
  switch (exception.code) {
    case 'P2002':
      return new ConflictException('Cette ressource existe déjà.');
    case 'P2025':
      return new NotFoundException('Ressource introuvable.');
    case 'P2003':
      return new ConflictException('Opération impossible : une ressource liée est manquante ou encore utilisée.');
    case 'P2000':
      return new BadRequestException('Valeur trop longue pour ce champ.');
    default:
      return null;
  }
}

interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
  errors?: any[];
  timestamp: string;
  path: string;
  method: string;
}

/**
 * Global exception filter that catches all exceptions
 * and returns a standardized error response
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(rawException: unknown, host: ArgumentsHost) {
    const exception = prismaErrorToHttp(rawException) ?? rawException;
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse: ErrorResponse = {
      statusCode: status,
      // Erreur serveur : jamais de détail interne (SQL, chemins, secrets) côté client.
      message: status >= 500 ? INTERNAL_ERROR_MESSAGE : this.getErrorMessage(exception),
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    // Add error name for non-500 errors
    if (status !== HttpStatus.INTERNAL_SERVER_ERROR) {
      errorResponse.error = this.getErrorName(exception);
    }

    // Add validation errors if present
    const validationErrors = this.getValidationErrors(exception);
    if (validationErrors) {
      errorResponse.errors = validationErrors;
    }

    // Log : l'exception d'origine (Prisma comprise), avec sa pile pour les 5xx.
    this.logError(rawException, request, status);

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      const retryAfter = this.getRetryAfter(exception);
      if (retryAfter) {
        response.header('Retry-After', String(retryAfter));
      }
    }

    response.status(status).send(errorResponse);
  }

  // TenantThrottlerGuard.throwThrottlingException attache `retryAfter` (secondes)
  // au body de l'exception — seul moyen pour le client de savoir combien de
  // temps attendre avant de relancer un appel dans un fan-out.
  private getRetryAfter(exception: unknown): number | undefined {
    if (!(exception instanceof HttpException)) return undefined;
    const body = exception.getResponse();
    return typeof body === 'object' && body !== null && 'retryAfter' in body
      ? Number((body as { retryAfter: unknown }).retryAfter)
      : undefined;
  }

  private getErrorMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (typeof response === 'object' && 'message' in response) {
        const message = (response as any).message;
        return Array.isArray(message) ? message[0] : message;
      }
    }

    if (exception instanceof Error) {
      return exception.message;
    }

    return 'Internal server error';
  }

  private getErrorName(exception: unknown): string {
    if (exception instanceof HttpException) {
      return exception.name;
    }
    if (exception instanceof Error) {
      return exception.name;
    }
    return 'UnknownError';
  }

  private getValidationErrors(exception: unknown): any[] | null {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null) {
        if ('errors' in response && Array.isArray((response as any).errors)) {
          return (response as any).errors;
        }

        if ('message' in response) {
          const message = (response as any).message;
          if (Array.isArray(message)) {
            return message;
          }
        }
      }
    }
    return null;
  }

  private logError(exception: unknown, request: FastifyRequest, status: number) {
    const message = this.getErrorMessage(exception);
    const logContext = {
      method: request.method,
      url: request.url,
      status,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    };

    if (status >= 500) {
      this.logger.error(
        `${message}\n${JSON.stringify(logContext, null, 2)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${message} - ${JSON.stringify(logContext)}`);
    }
  }
}
