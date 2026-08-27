import { IsString, IsNotEmpty, IsDateString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartSyncJobDto {
    @ApiProperty({ description: 'ID de l\'intégration Weezevent', example: 'cmp5tfhjy0agr3kle34zrlcud' })
    @IsString()
    @IsNotEmpty()
    integrationId: string;

    // Optionnel : si absent, le controller calcule la fenêtre par défaut (lastSyncedAt - 5min,
    // ou tout l'historique au premier sync) — même logique que le chemin incrémental legacy.
    @ApiPropertyOptional({ description: 'Date de début — YYYY-MM-DD ou ISO 8601', example: '2026-01-01' })
    @IsOptional()
    @IsDateString()
    fromDate?: string;

    @ApiPropertyOptional({ description: 'Date de fin — YYYY-MM-DD ou ISO 8601', example: '2026-05-31' })
    @IsOptional()
    @IsDateString()
    toDate?: string;
}
