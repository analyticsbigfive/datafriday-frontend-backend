import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { SupabaseAdminService } from './supabase-admin.service';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

// data:<mime>;base64,<payload>
const DATA_URI_RE = /^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s;

/**
 * Converts base64 data-URIs (as still sent by some frontend upload forms)
 * into files in Supabase Storage, returning the public URL. Values that are
 * already a URL (or empty) pass through untouched, so every write path can
 * pipe `dto.image` / `dto.picture` through `resolveImage()` unconditionally.
 */
@Injectable()
export class SupabaseStorageService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly bucket: string;

  constructor(
    private readonly admin: SupabaseAdminService,
    private readonly config: ConfigService,
  ) {
    this.bucket = this.config.get<string>('SUPABASE_STORAGE_BUCKET') || 'images';
  }

  async onModuleInit() {
    if (!this.admin.isEnabled()) return;
    try {
      await this.ensureBucket();
    } catch (error) {
      this.logger.warn(`Could not ensure storage bucket "${this.bucket}": ${error.message}`);
    }
  }

  private async ensureBucket(): Promise<void> {
    const client = this.admin.getServiceClient();
    const { data: buckets, error } = await client.storage.listBuckets();
    if (error) {
      this.logger.warn(`listBuckets() failed: ${error.message}`);
      return;
    }
    if (buckets?.some((b) => b.name === this.bucket)) {
      return;
    }

    const { error: createError } = await client.storage.createBucket(this.bucket, {
      public: true,
      fileSizeLimit: MAX_IMAGE_BYTES,
    });
    if (createError) {
      // Concurrent boot of api + worker can race on creation; Supabase reports
      // this as a plain error rather than a "409-like" code.
      if (!/already exists/i.test(createError.message)) {
        this.logger.warn(`createBucket("${this.bucket}") failed: ${createError.message}`);
      }
      return;
    }
    this.logger.log(`Created Supabase Storage bucket "${this.bucket}" (public)`);
  }

  /**
   * Uploads a base64 data-URI to Storage and returns its public URL.
   * `folder` groups uploads by entity (e.g. "spaces", "menu-items") for
   * easier browsing in the Supabase dashboard.
   */
  async resolveImage(
    value: string | null | undefined,
    folder: string,
  ): Promise<string | null | undefined> {
    if (!value) return value;

    const match = DATA_URI_RE.exec(value);
    if (!match) return value; // already a URL — pass through unchanged

    if (!this.admin.isEnabled()) {
      throw new BadRequestException(
        "Le stockage des images est indisponible (Supabase Storage non configuré sur ce serveur).",
      );
    }

    const [, mime, base64Payload] = match;
    const ext = ALLOWED_MIME_TO_EXT[mime.toLowerCase()];
    if (!ext) {
      throw new BadRequestException(`Type d'image non supporté: ${mime}`);
    }

    const buffer = Buffer.from(base64Payload, 'base64');
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image trop volumineuse (${(buffer.byteLength / (1024 * 1024)).toFixed(1)} Mo, max ${MAX_IMAGE_BYTES / (1024 * 1024)} Mo)`,
      );
    }

    const path = `${folder}/${randomUUID()}.${ext}`;
    const client = this.admin.getServiceClient();
    const { error: uploadError } = await client.storage.from(this.bucket).upload(path, buffer, {
      contentType: mime,
      upsert: false,
    });
    if (uploadError) {
      this.logger.error(`Upload to Storage failed (${path}): ${uploadError.message}`);
      throw new BadRequestException(`Échec de l'upload de l'image: ${uploadError.message}`);
    }

    const { data } = client.storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }
}
