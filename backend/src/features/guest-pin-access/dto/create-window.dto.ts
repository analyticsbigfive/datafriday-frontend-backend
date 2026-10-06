import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateWindowDto {
  @ApiProperty({ description: "ID de l'espace" })
  @IsString()
  spaceId: string;

  @ApiProperty({ description: "ID de l'événement" })
  @IsString()
  eventId: string;

  @ApiProperty({ enum: ['pre-event', 'post-event'] })
  @IsIn(['pre-event', 'post-event'])
  phase: 'pre-event' | 'post-event';

  @ApiPropertyOptional({ description: 'Le manager voit-il les quantités attendues ?', default: false })
  @IsOptional()
  @IsBoolean()
  showExpected?: boolean;
}

/** Cible du bandeau (Démarrage / Reprise, Arrêt) : une phase d'un event. */
export class WindowTargetDto {
  @ApiProperty({ description: "ID de l'espace" })
  @IsString()
  spaceId: string;

  @ApiProperty({ description: "ID de l'événement" })
  @IsString()
  eventId: string;

  @ApiProperty({ enum: ['pre-event', 'post-event'] })
  @IsIn(['pre-event', 'post-event'])
  phase: 'pre-event' | 'post-event';
}

/** Cible d'une ligne PDV (▶ / ■) : une phase d'un event, pour un seul PDV. */
export class WindowElementDto extends WindowTargetDto {
  @ApiProperty({ description: 'ID du PDV (SpaceElement)' })
  @IsString()
  elementId: string;
}
