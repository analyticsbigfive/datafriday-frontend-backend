import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

// BUG-106 : secret de signature webhook Weezevent par intégration (au lieu du seul
// Tenant.weezeventWebhookSecret global) — même contrat que WebhookConfigDto (tenant-level,
// legacy), scopé à une instance Weezevent précise.
export class UpdateWeezeventWebhookDto {
    // Optionnel : rotation du secret uniquement si fourni (garde l'existant sinon)
    @IsOptional()
    @IsString()
    @MinLength(1)
    webhookSecret?: string;

    @IsOptional()
    @IsBoolean()
    webhookEnabled?: boolean;
}
