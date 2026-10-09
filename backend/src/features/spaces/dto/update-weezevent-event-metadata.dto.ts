import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Métadonnées libres d'un event Weezevent (fusionnées dans SalesEvent.metadata).
 * `dfEventId` : miroir de l'Event DataFriday lié, posé par l'assistant d'intégration
 * (StepProcessTimeline) pour réhydrater ses rattachements.
 */
export class UpdateWeezeventEventMetadataDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) doorsOpening?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) showTime?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) category?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) eventType?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) team?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) visitingTeam?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasIntermission?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) performer?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) openingAct?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(200) sponsor?: string | null;
  @ApiPropertyOptional({ description: "Id de l'Event DataFriday lié (miroir pour le front)" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  dfEventId?: string;
}
