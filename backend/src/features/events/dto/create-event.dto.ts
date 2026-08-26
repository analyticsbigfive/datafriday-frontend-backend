import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsDateString, IsInt, IsNumber, Min, IsBoolean, IsArray, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEventDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @ApiProperty() @IsDateString() eventDate: string;
  // nullable : démapper un event d'un space (étape 4 Data Integration) sans le supprimer
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() spaceId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() configurationId?: string | null;
  // BUG-368-02 : intégration/data-source explicite de cet event — posé par bulkCreateEvents
  // (StepProcessTimeline.vue) à la création, permet à l'agrégation de matcher directement par
  // intégration + fenêtre calendaire sans jamais regarder t.eventId (remplace la déduction
  // implicite via weezeventEventId → conteneur de saison, BUG-146-01, legacy).
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() integrationId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() eventTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventCategoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventSubcategoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() spaceName?: string;
  // @Type(() => Object) requis : sans lui, class-transformer (enableImplicitConversion,
  // main.ts) lit le design:type TS d'un `any[]` comme `Array` et tente de convertir CHAQUE
  // élément vers ce même type via Array.from(...) — un objet {doorsOpening, showTime} n'a ni
  // length ni itérateur, Array.from() le réduit donc silencieusement à [] (confirmé : sans ce
  // décorateur, un payload sessions:[{doorsOpening,showTime}] ressort en [[]] après le pipe de
  // validation, alors qu'un tableau de strings/nombres traverse le pipe sans dégât).
  @ApiPropertyOptional() @IsOptional() @IsArray() @Type(() => Object) sessions?: any[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) numberOfSessions?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasOpeningAct?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasIntermission?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() eventStartDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() eventEndDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventEndTime?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) ticketsSold?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) ticketsScanned?: number;
  // Teams (events sport) — null explicite = désassigner
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() homeTeamName?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() visitingTeamId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() visitingTeamName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() performerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sponsor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() openingActName?: string;
  // Revenue tracking — normalement calculé par le pipeline d'agrégation (jamais écrit
  // automatiquement à ce jour), mais EventFormDrawer.vue expose ces 4 champs en saisie
  // manuelle depuis l'origine ; le DTO ne les déclarait pas, ce qui faisait échouer TOUT
  // le save (whitelist/forbidNonWhitelisted) dès que l'un d'eux était non-null — le cas
  // pour tout event déjà rapproché de Weezevent (BUG-270).
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) revenue?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) transactionCount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgSpendPerTx?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) perCapita?: number;
}
