import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { DigifoodCsvImportService } from './services/digifood-csv-import.service';

/**
 * Route « plate » (tenantId résolu depuis le JWT seul, pas d'organizationId dans l'URL) —
 * même style que weezevent.controller.ts::getSyncJobStatus. Nécessaire pour que
 * SyncJobFloatingWidget (monté une fois dans App.vue, persistant inter-routes ET après un
 * refresh complet) puisse reprendre le suivi d'un job en ne connaissant que son jobId,
 * sans avoir à re-mémoriser l'organizationId/instanceId d'origine.
 */
@ApiTags('Digifood')
@ApiBearerAuth('supabase-jwt')
@Controller('digifood')
@UseGuards(JwtDatabaseGuard)
export class DigifoodController {
    constructor(private readonly digifoodCsvImport: DigifoodCsvImportService) { }

    @Get('import-csv/status/:jobId')
    @ApiOperation({ summary: "État d'un job d'import CSV Digifood réel (polling front)" })
    @ApiParam({ name: 'jobId', description: 'ID du job retourné par POST .../import-csv (dryRun=false)' })
    @ApiResponse({ status: 200, description: 'État du job (status, compteurs, processed, progress %)' })
    async getCsvImportJobStatus(
        @CurrentUser() user: any,
        @Param('jobId') jobId: string,
    ) {
        const tenantId = user.tenantId;
        const job = await this.digifoodCsvImport.getImportJobStatus(tenantId, jobId);
        if (!job) throw new NotFoundException(`Job d'import ${jobId} introuvable.`);
        return job;
    }
}
