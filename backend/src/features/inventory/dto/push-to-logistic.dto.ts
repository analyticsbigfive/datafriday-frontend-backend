import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

/** Déclenchement manuel du recalage Logistic depuis un écran Pre/Post-event Inventory. */
export class PushToLogisticDto {
  @ApiProperty({ description: "ID de l'événement compté" })
  @IsString()
  eventId: string;

  @ApiProperty({ enum: ['pre-event', 'post-event'], description: "Écran d'origine" })
  @IsIn(['pre-event', 'post-event'])
  phase: 'pre-event' | 'post-event';
}
