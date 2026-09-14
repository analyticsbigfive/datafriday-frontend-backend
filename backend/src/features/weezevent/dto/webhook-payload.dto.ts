import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Documentation Swagger du webhook WeezPay (docapi.weezevent.com, "Webhooks"). La validation
 * réelle se fait dans webhook-payload.parser.ts, volontairement tolérante aux champs inconnus.
 */
export class WeezeventWebhookPayloadDto {
    @ApiProperty({ enum: ['transaction', 'wallet', 'refill', 'scan', 'transfer'] })
    type: string;

    @ApiProperty({ enum: ['create', 'update', 'delete'] })
    method: string;

    @ApiPropertyOptional({ enum: ['gill', 'butter', 'pyvar'], description: 'Micro-service émetteur (gill = WeezPay)' })
    origin?: string;

    @ApiPropertyOptional({ description: 'Organization ID Weezevent' })
    organization_id?: number;

    @ApiProperty({ description: "Id de l'objet (transaction, wallet, ...)" })
    id: number;

    @ApiPropertyOptional({ type: Object, description: "Détails de l'objet" })
    values?: Record<string, unknown>;
}
