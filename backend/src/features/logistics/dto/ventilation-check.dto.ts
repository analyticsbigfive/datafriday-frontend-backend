import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';
import { GuestVentilationCheckDto } from '../../guest-pin-access/dto/ventilation.dto';

/** Validation de dépôt côté Logistique (compte DataFriday) : les matchs viennent du corps. */
export class VentilationCheckDto extends GuestVentilationCheckDto {
  @ApiProperty({ description: 'Matchs de la sélection', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  eventIds: string[];
}
