import type { UploadApiOptions } from 'cloudinary';

/** Trimmed-down view of Cloudinary's upload response — the fields callers actually need. */
export interface UploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  format: string;
  resourceType: string;
  bytes: number;
  width?: number;
  height?: number;
}

export interface UploadFileOptions {
  /** Cloudinary folder to store the asset under, e.g. 'ordara/avatars'. */
  folder?: string;
  /** Fixed public id instead of a Cloudinary-generated one — lets a caller replace an asset in place. */
  publicId?: string;
  /** Defaults to 'image'; Cloudinary also accepts 'video' | 'raw' | 'auto'. */
  resourceType?: UploadApiOptions['resource_type'];
  /** Overwrite an existing asset at `publicId`. Defaults to true whenever `publicId` is given. */
  overwrite?: boolean;
}
