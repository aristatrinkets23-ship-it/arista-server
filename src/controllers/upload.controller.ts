import { Request, Response } from 'express';
import { StorageService } from '../services/storage.service';

export const uploadImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { image, folder = 'products' } = req.body;

    if (!image || typeof image !== 'string') {
      res.status(400).json({ success: false, message: 'Image payload is required as a string data URL or URL' });
      return;
    }

    const validFolders = ['products', 'categories', 'banners', 'general'];
    const safeFolder = validFolders.includes(folder) ? folder : 'products';

    const result = await StorageService.uploadImage(image, safeFolder);

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: result.url,
        provider: result.provider,
        format: result.format,
        bytes: result.bytes
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to process image upload' });
  }
};

export const getStorageStatus = async (_req: Request, res: Response): Promise<void> => {
  const isCdn = StorageService.isCloudinaryConfigured();
  res.status(200).json({
    success: true,
    message: 'Storage configuration retrieved',
    data: {
      activeProvider: isCdn ? 'cloudinary' : 'local',
      isCloudinaryConfigured: isCdn
    }
  });
};
