import { ArgumentMetadata, Injectable, ValidationPipe, ValidationPipeOptions } from '@nestjs/common';

const COMMON: ValidationPipeOptions = {
  transform: true, // Instancie le DTO via class-transformer
  whitelist: true, // Retire les champs sans décorateur
  transformOptions: { enableImplicitConversion: true },
  validationError: { target: false, value: false }, // Ne pas renvoyer le payload dans les erreurs
};

/**
 * Validation globale des DTO.
 * - Corps et paramètres de route : un champ inconnu est refusé (anti mass-assignment).
 * - Query string : un paramètre inconnu est simplement ignoré, comme avant l'introduction
 *   des DTO de query (un client qui ajoute un paramètre de cache ne doit pas recevoir de 400).
 *   Les paramètres déclarés restent validés.
 */
@Injectable()
class AppValidationPipe extends ValidationPipe {
  private readonly lenientQuery = new ValidationPipe({ ...COMMON, forbidNonWhitelisted: false });

  constructor() {
    super({ ...COMMON, forbidNonWhitelisted: true });
  }

  override async transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type === 'query') return this.lenientQuery.transform(value, metadata);
    return super.transform(value, metadata);
  }
}

/** Pipe de validation global de l'API (main.ts), partagé avec les tests de DTO. */
export function createGlobalValidationPipe(): ValidationPipe {
  return new AppValidationPipe();
}
