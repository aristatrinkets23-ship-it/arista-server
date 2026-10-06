import { Request, Response, NextFunction } from 'express';
import {
  getStoreSettings,
  updateStoreSettings,
  PublicStoreSettings
} from '../services/storeSettings.service';
import { logger } from '../utils/logger';

/**
 * Public: Get Store Settings (delivery charge, free delivery threshold, GST percentage, company info)
 * GET /api/v1/settings
 */
export const getPublicSettingsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getStoreSettings();
    const publicData: PublicStoreSettings = {
      gstNumber: settings.gstNumber,
      gstPercentage: settings.gstPercentage,
      deliveryCharge: settings.deliveryCharge,
      freeDeliveryThreshold: settings.freeDeliveryThreshold,
      companyName: settings.companyName,
      companyAddress: settings.companyAddress,
      companyPhone: settings.companyPhone,
      companyEmail: settings.companyEmail,
      companyTiming: settings.companyTiming,
      invoicePrefix: settings.invoicePrefix
    };

    return res.status(200).json({
      success: true,
      data: publicData
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Get Complete Store Settings
 * GET /api/v1/admin/settings
 */
export const getAdminSettingsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getStoreSettings(true);
    return res.status(200).json({
      success: true,
      data: settings
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Update Store Settings (GSTIN, delivery charge, free threshold, company details)
 * PUT /api/v1/admin/settings
 */
export const updateAdminSettingsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body. Expected settings key-value object.'
      });
    }

    try {
      const updated = await updateStoreSettings(updates);
      logger.info(`Store settings updated by Admin [${(req as any).user?.email || 'admin'}]`);

      return res.status(200).json({
        success: true,
        message: 'Store settings successfully updated and saved to database.',
        data: updated
      });
    } catch (valErr: any) {
      return res.status(400).json({
        success: false,
        message: valErr.message || 'Validation error while updating store settings.'
      });
    }
  } catch (err) {
    next(err);
  }
};
