import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Public: Get Homepage Configurations (e.g. editorial image)
 */
export const getHomepageConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT section_key, section_label, image, updated_at FROM homepage_config`
    );

    const configMap: Record<string, string> = {};
    if (Array.isArray(rows)) {
      rows.forEach((row: any) => {
        configMap[row.section_key] = row.image;
      });
    }

    res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({
      success: true,
      data: configMap,
      raw: rows
    });
  } catch (err) {
    logger.error('Error fetching homepage config:', err);
    next(err);
  }
};

/**
 * Admin: Update Homepage Configuration item
 */
export const updateHomepageConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sectionKey = req.body.sectionKey || req.body.section_key;
    const image = req.body.image;
    const sectionLabel = req.body.sectionLabel || req.body.section_label || 'Editorial Section Photo';

    if (!sectionKey || !image) {
      return res.status(400).json({
        success: false,
        message: 'sectionKey and image are required.'
      });
    }

    await pool.query(
      `INSERT INTO homepage_config (section_key, section_label, image)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE image = ?, section_label = ?, updated_at = CURRENT_TIMESTAMP`,
      [sectionKey, sectionLabel, image, image, sectionLabel]
    );

    logger.info(`Admin updated homepage config for key: ${sectionKey}`);

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      message: 'Homepage configuration updated successfully.',
      data: {
        sectionKey,
        image
      }
    });
  } catch (err) {
    logger.error('Error updating homepage config:', err);
    next(err);
  }
};
