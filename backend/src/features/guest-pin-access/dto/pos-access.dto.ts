import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

/** Démarrage ou arrêt en masse des caisses : liste des PdV (SpaceElement.id) de l'évènement. */
export class PosElementIdsDto {
  @ApiProperty({ description: 'PdV concernés (SpaceElement.id)', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  elementIds: string[];
}
