import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseAdminService } from './supabase-admin.service';
import { SupabaseStorageService } from './supabase-storage.service';

/**
 * Global module exposing the Supabase Admin (service-role) client and the
 * Storage helper built on top of it. Imported once; both services are then
 * injectable anywhere without each feature module importing this one.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [SupabaseAdminService, SupabaseStorageService],
  exports: [SupabaseAdminService, SupabaseStorageService],
})
export class SupabaseModule {}
