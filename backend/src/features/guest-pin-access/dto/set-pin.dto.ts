import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Le PIN est TOUJOURS généré côté serveur (décision produit) — ce DTO ne fait que
 *  désigner le PDV pour lequel un accès doit être créé/régénéré. */
export class SetPinDto {
  @ApiProperty({ description: 'ID du PDV (SpaceElement)' })
  @IsString()
  elementId: string;
}
