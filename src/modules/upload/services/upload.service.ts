import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import {
  v2 as cloudinary,
  type UploadApiOptions,
  type UploadApiResponse,
} from 'cloudinary';
import { getAppConfig } from '@common/utils';
import type { UploadFileOptions, UploadResult } from '../types';

/**
 * Generic, storage-only wrapper around the Cloudinary SDK. It knows nothing
 * about users or any other business domain — callers decide folders, public
 * ids, and what to do with the returned URL/public id. Reusable by any
 * module that needs to store a file.
 */
@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const { cloudinary: config } = getAppConfig(this.configService);

    if (!config.cloudName || !config.apiKey || !config.apiSecret) {
      this.logger.warn(
        'Cloudinary credentials are not configured — file uploads will fail until CLOUDINARY_* env vars are set.',
      );
      return;
    }

    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    });
  }

  /** Streams a buffered file (e.g. from Multer's memory storage) up to Cloudinary. */
  async uploadFile(
    file: Express.Multer.File,
    options: UploadFileOptions = {},
  ): Promise<UploadResult> {
    try {
      const response = await new Promise<UploadApiResponse>(
        (resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: options.folder,
              public_id: options.publicId,
              resource_type: options.resourceType ?? 'image',
              overwrite: options.overwrite ?? Boolean(options.publicId),
            },
            (error, result) => {
              if (error || !result) {
                reject(
                  new Error(error?.message ?? 'Cloudinary returned no result'),
                );
                return;
              }
              resolve(result);
            },
          );

          Readable.from(file.buffer).pipe(uploadStream);
        },
      );

      return {
        url: response.url,
        secureUrl: response.secure_url,
        publicId: response.public_id,
        format: response.format,
        resourceType: response.resource_type,
        bytes: response.bytes,
        width: response.width,
        height: response.height,
      };
    } catch (error) {
      this.logger.error(
        `Cloudinary upload failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException(
        'Failed to upload file. Please try again.',
      );
    }
  }

  /** Removes a previously uploaded asset. Callers should treat a missing/unknown id as a no-op concern of their own. */
  async deleteFile(
    publicId: string,
    resourceType: UploadApiOptions['resource_type'] = 'image',
  ): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
    } catch (error) {
      this.logger.error(
        `Cloudinary delete failed for "${publicId}": ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException('Failed to delete file.');
    }
  }
}
