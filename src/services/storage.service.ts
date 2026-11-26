import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';

export interface UploadResult {
  url: string;
  provider: 'cloudinary' | 'local';
  format: string;
  bytes: number;
}

export class StorageService {
  private static cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
  private static apiKey = process.env.CLOUDINARY_API_KEY || '';
  private static apiSecret = process.env.CLOUDINARY_API_SECRET || '';
  private static baseFolder = process.env.CLOUDINARY_FOLDER || 'arista_trinkets';

  /**
   * Checks whether Cloudinary CDN credentials are fully configured in environment
   */
  public static isCloudinaryConfigured(): boolean {
    return Boolean(this.cloudName && this.apiKey && this.apiSecret);
  }

  /**
   * Uploads an image (Base64 data URL or pure Base64) to Cloudinary CDN or local static storage.
   * Returns a persistent CDN URL or static URL to store in the database instead of huge Base64 strings.
   */
  public static async uploadImage(base64Data: string, subFolder: string = 'products'): Promise<UploadResult> {
    if (!base64Data || typeof base64Data !== 'string') {
      throw new Error('Invalid image payload: string expected');
    }

    // If it's already an HTTP / CDN URL or an existing asset path, return as-is
    if (base64Data.startsWith('http://') || base64Data.startsWith('https://') || (base64Data.startsWith('/assets/') && !base64Data.startsWith('data:'))) {
      return {
        url: base64Data,
        provider: this.isCloudinaryConfigured() ? 'cloudinary' : 'local',
        format: 'webp',
        bytes: base64Data.length
      };
    }

    if (this.isCloudinaryConfigured()) {
      return await this.uploadToCloudinary(base64Data, subFolder);
    } else {
      return await this.uploadToLocalStorage(base64Data, subFolder);
    }
  }

  /**
   * Direct secure upload to Cloudinary CDN using REST API
   */
  private static async uploadToCloudinary(base64Data: string, subFolder: string): Promise<UploadResult> {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const folderPath = `${this.baseFolder}/${subFolder}`;

      // Cloudinary signature generation: alphabetically sorted keys concatenated with secret
      const paramsToSign = `folder=${folderPath}&timestamp=${timestamp}${this.apiSecret}`;
      const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

      const formData = new URLSearchParams();
      formData.append('file', base64Data);
      formData.append('api_key', this.apiKey);
      formData.append('timestamp', String(timestamp));
      formData.append('folder', folderPath);
      formData.append('signature', signature);

      const endpoint = `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      const data = await response.json() as any;

      if (!response.ok || data.error) {
        logger.error(`Cloudinary upload failed: ${data.error?.message || response.statusText}`);
        logger.info('Falling back to local storage for image persistence.');
        return await this.uploadToLocalStorage(base64Data, subFolder);
      }

      logger.info(`Successfully uploaded image to Cloudinary CDN: ${data.secure_url}`);
      return {
        url: data.secure_url,
        provider: 'cloudinary',
        format: data.format || 'webp',
        bytes: data.bytes || 0
      };
    } catch (err: any) {
      logger.error(`Error during Cloudinary upload: ${err.message}. Falling back to local storage.`);
      return await this.uploadToLocalStorage(base64Data, subFolder);
    }
  }

  /**
   * Local storage fallback: saves file to public/uploads directory and serves statically
   */
  private static async uploadToLocalStorage(base64Data: string, subFolder: string): Promise<UploadResult> {
    const uploadBaseDir = path.join(process.cwd(), 'public', 'uploads', subFolder);
    if (!fs.existsSync(uploadBaseDir)) {
      fs.mkdirSync(uploadBaseDir, { recursive: true });
    }

    // Determine extension and extract raw buffer
    let extension = 'webp';
    let rawBase64 = base64Data;

    if (base64Data.startsWith('data:')) {
      const match = base64Data.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/);
      if (match) {
        extension = match[1].toLowerCase();
        if (extension === 'jpeg') extension = 'jpg';
        rawBase64 = base64Data.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      }
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 12);
    const filename = `${subFolder}_${Date.now()}_${hash}.${extension}`;
    const filePath = path.join(uploadBaseDir, filename);

    await fs.promises.writeFile(filePath, buffer);
    const publicUrl = `/uploads/${subFolder}/${filename}`;

    logger.info(`Saved image to local storage: ${publicUrl} (${buffer.length} bytes)`);

    return {
      url: publicUrl,
      provider: 'local',
      format: extension,
      bytes: buffer.length
    };
  }
}
