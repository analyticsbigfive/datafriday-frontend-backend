import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateInventoryDto {
  @ApiProperty({ description: "ID de l'espace" })
  @IsString()
  spaceId: string;

  @ApiPropertyOptional({ description: "ID de l'événement" })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({
    description:
      "Phase du comptage : 'pre-event' (avant match) | 'post-event' (après match). Absent = legacy.",
    enum: ['pre-event', 'post-event'],
  })
  @IsOptional()
  @IsIn(['pre-event', 'post-event'])
  kind?: 'pre-event' | 'post-event';

  @ApiProperty({
    description:
      'Snapshot complet des comptages : { shopId: { itemId: { packedUnits, looseUnits, isCounted, ... } } }',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  inventoryCounts: Record<string, Record<string, any>>;
}
