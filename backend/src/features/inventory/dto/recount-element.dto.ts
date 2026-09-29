import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** « Recompter » un point de vente en post-event : ses articles repassent à compter. */
export class RecountElementDto {
  @ApiProperty({ description: "ID de l'événement" })
  @IsString()
  eventId: string;

  @ApiProperty({ description: 'ID du point de vente (SpaceElement) à recompter' })
  @IsString()
  elementId: string;
}
