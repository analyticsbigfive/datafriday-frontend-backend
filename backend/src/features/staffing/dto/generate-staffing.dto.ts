import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

/**
 * Corps optionnel de `POST /events/:eventId/staffing/generate` (BUG-391-02).
 * Un POST sans corps reste valide : la génération retombe alors sur la version
 * par défaut puis sur `ElementPerformance.revenue`, comme avant.
 */
export class GenerateStaffingDto {
  @ApiPropertyOptional({
    description:
      "CA prédit par PDV tel qu'affiché à l'écran Event Predict ({ [elementId]: CA en € }). " +
      'Prioritaire sur la version par défaut. Les valeurs non numériques, négatives ou non finies ' +
      "sont ignorées, ainsi que les clés hors configuration de l'événement.",
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { 'element-id-1': 12500, 'element-id-2': 830.5 },
  })
  @IsOptional()
  @IsObject()
  predictedRevenueByElement?: Record<string, number>;
}
