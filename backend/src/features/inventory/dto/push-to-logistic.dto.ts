import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/** Déclenchement manuel du recalage Logistic depuis un écran Pre/Post-event Inventory. */
export class PushToLogisticDto {
  @ApiProperty({ description: "ID de l'événement compté" })
  @IsString()
  eventId: string;

  @ApiProperty({ enum: ['pre-event', 'post-event'], description: "Écran d'origine" })
  @IsIn(['pre-event', 'post-event'])
  phase: 'pre-event' | 'post-event';

  @ApiPropertyOptional({
    description: 'Un seul PDV (mise à jour manuelle par point de vente) ; absent = tous les PDV',
  })
  @IsOptional()
  @IsString()
  elementId?: string;
}
