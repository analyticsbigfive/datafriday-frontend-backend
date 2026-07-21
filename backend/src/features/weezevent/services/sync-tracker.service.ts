import { Injectable } from '@nestjs/common';

export interface SyncJob {
    id: string;
    tenantId: string;
    /** BUG-027 : scope optionnel par intégration — un tenant peut avoir plusieurs intégrations
     *  Weezevent actives en parallèle (cf. BUG-025), chacune avec son propre cycle de sync. Sans ce
     *  scope, un lock tenant-only bloquerait à tort la sync d'une 2ᵉ intégration pendant que la 1ère
     *  tourne. */
    integrationId?: string;
    type: 'transactions' | 'events' | 'products';
    status: 'running' | 'completed' | 'failed';
    startedAt: Date;
    completedAt?: Date;
    error?: string;
    progress?: {
        current: number;
        total: number;
    };
}

@Injectable()
export class SyncTrackerService {
    private jobs: Map<string, SyncJob> = new Map();

    /**
     * Start tracking a sync job
     */
    startSync(tenantId: string, type: SyncJob['type'], integrationId?: string): string {
        const id = integrationId
            ? `${tenantId}-${integrationId}-${type}-${Date.now()}`
            : `${tenantId}-${type}-${Date.now()}`;
        const job: SyncJob = {
            id,
            tenantId,
            integrationId,
            type,
            status: 'running',
            startedAt: new Date(),
        };
        this.jobs.set(id, job);
        return id;
    }

    /**
     * Update sync progress
     */
    updateProgress(id: string, current: number, total: number) {
        const job = this.jobs.get(id);
        if (job) {
            job.progress = { current, total };
            this.jobs.set(id, job);
        }
    }

    /**
     * Mark sync as completed
     */
    completeSync(id: string) {
        const job = this.jobs.get(id);
        if (job) {
            job.status = 'completed';
            job.completedAt = new Date();
            this.jobs.set(id, job);

            // Clean up after 5 minutes
            setTimeout(() => this.jobs.delete(id), 5 * 60 * 1000);
        }
    }

    /**
     * Mark sync as failed
     */
    failSync(id: string, error: string) {
        const job = this.jobs.get(id);
        if (job) {
            job.status = 'failed';
            job.completedAt = new Date();
            job.error = error;
            this.jobs.set(id, job);

            // Clean up after 5 minutes
            setTimeout(() => this.jobs.delete(id), 5 * 60 * 1000);
        }
    }

    /**
     * Get running syncs for a tenant, optionnellement restreint à une intégration (BUG-027).
     */
    getRunningSyncs(tenantId: string, integrationId?: string): SyncJob[] {
        return Array.from(this.jobs.values()).filter(
            (job) =>
                job.tenantId === tenantId &&
                job.status === 'running' &&
                (integrationId === undefined || job.integrationId === integrationId),
        );
    }

    /**
     * Check if a sync is running for a tenant and type, optionnellement restreint à une
     * intégration (BUG-027).
     */
    isRunning(tenantId: string, type: SyncJob['type'], integrationId?: string): boolean {
        return Array.from(this.jobs.values()).some(
            (job) =>
                job.tenantId === tenantId &&
                job.type === type &&
                job.status === 'running' &&
                (integrationId === undefined || job.integrationId === integrationId),
        );
    }

    /**
     * Get all syncs for a tenant
     */
    getTenantSyncs(tenantId: string): SyncJob[] {
        return Array.from(this.jobs.values()).filter(
            (job) => job.tenantId === tenantId,
        );
    }

    /**
     * Get sync by ID
     */
    getSync(id: string): SyncJob | undefined {
        return this.jobs.get(id);
    }
}
