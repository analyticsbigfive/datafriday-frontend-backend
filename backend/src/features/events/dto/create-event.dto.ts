import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsDateString, IsInt, Min, IsBoolean, IsArray } from 'class-validator';

export class CreateEventDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty() @IsDateString() eventDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() spaceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() configurationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventCategoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventSubcategoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() spaceName?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() sessions?: any[];
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) numberOfSessions?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasOpeningAct?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasIntermission?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() eventStartDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() eventEndDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventEndTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) ticketsSold?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) ticketsScanned?: number;
  // Teams (events sport) — null explicite = désassigner
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() homeTeamName?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() visitingTeamId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() visitingTeamName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() performerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sponsor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() openingActName?: string;
}
