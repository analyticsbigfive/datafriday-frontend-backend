import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsObject, Min } from 'class-validator';

export class SaveReportLayoutDto {
  @ApiProperty({ description: 'Document de mise en page ({ version: 1, slots: [...] })' })
  @IsObject()
  layout: Record<string, unknown>;

  @ApiProperty({ description: 'Version lue au chargement (0 si aucune mise en page enregistrée)' })
  @IsInt()
  @Min(0)
  version: number;
}
