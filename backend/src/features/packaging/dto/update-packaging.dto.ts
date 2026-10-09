import { PartialType } from '@nestjs/swagger';
import { CreatePackagingDto } from './create-packaging.dto';

/** Mise à jour partielle : mêmes règles de validation que la création, tous champs optionnels. */
export class UpdatePackagingDto extends PartialType(CreatePackagingDto) {}
