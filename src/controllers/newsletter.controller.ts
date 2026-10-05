import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../config/database';
import { ApiResponse } from '../utils/api-response';
import { logger } from '../utils/logger';

/**
 * Rate limiter specifically for newsletter subscriptions (abuse prevention)
 * Allows up to 10 subscription requests per IP per 15 minutes.
 */
export const newsletterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many subscription attempts from this network. Please try again after a few minutes.'
  }
});

/**
 * Validate email format with standard email regex
 */
function isValidEmail(email: string): boolean {
  if (!email || email.length > 150) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Subscribe to The Arista Club newsletter
 * POST /api/v1/newsletter
 */
export const subscribeNewsletter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawEmail = req.body?.email;

    // 1. Validate existence and type
    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json(
        ApiResponse.error('Email address is required.', 400)
      );
    }

    // 2. Normalize: trim whitespace and lowercase
    const normalizedEmail = rawEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json(
        ApiResponse.error('Email address cannot be empty.', 400)
      );
    }

    // 3. Format & length validation
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json(
        ApiResponse.error('Please enter a valid email address (e.g. name@example.com).', 400)
      );
    }

    // 4. Check for existing subscriber (idempotent handling)
    const [existingRows]: any = await pool.query(
      `SELECT id, email, is_active FROM newsletter_subscribers WHERE email = ? LIMIT 1`,
      [normalizedEmail]
    );

    if (existingRows && existingRows.length > 0) {
      const subscriber = existingRows[0];

      if (subscriber.is_active === 1 || subscriber.is_active === true) {
        logger.info(`[NEWSLETTER] Email already subscribed: ${normalizedEmail}`);
        return res.status(200).json(
          ApiResponse.success(
            'You are already subscribed to The Arista Club.',
            { email: normalizedEmail, alreadySubscribed: true },
            undefined,
            200
          )
        );
      } else {
        // Reactivate previously unsubscribed email
        await pool.query(
          `UPDATE newsletter_subscribers SET is_active = 1, subscribed_at = CURRENT_TIMESTAMP, unsubscribed_at = NULL WHERE id = ?`,
          [subscriber.id]
        );
        logger.info(`[NEWSLETTER] Reactivated subscription for: ${normalizedEmail}`);
        return res.status(200).json(
          ApiResponse.success(
            'Welcome back! Your subscription to The Arista Club has been reactivated.',
            { email: normalizedEmail, reactivated: true },
            undefined,
            200
          )
        );
      }
    }

    // 5. Insert new subscriber
    const [insertResult]: any = await pool.query(
      `INSERT INTO newsletter_subscribers (email, is_active) VALUES (?, 1)`,
      [normalizedEmail]
    );

    logger.info(`[NEWSLETTER] New subscriber joined The Arista Club: ${normalizedEmail} (ID: ${insertResult.insertId})`);

    return res.status(201).json(
      ApiResponse.created(
        'Thank you for joining The Arista Club. Private invitations and VIP previews will be sent to your inbox.',
        { id: insertResult.insertId, email: normalizedEmail }
      )
    );
  } catch (err: any) {
    logger.error(`[NEWSLETTER] Failed to process subscription: ${err.message}`);
    next(err);
  }
};

/**
 * Admin: List newsletter subscribers
 * GET /api/v1/admin/newsletter
 */
export const getNewsletterSubscribers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [subscribers]: any = await pool.query(
      `SELECT id, email, is_active, subscribed_at, unsubscribed_at FROM newsletter_subscribers ORDER BY subscribed_at DESC`
    );
    return res.status(200).json(
      ApiResponse.success('Newsletter subscribers retrieved successfully.', subscribers)
    );
  } catch (err: any) {
    logger.error(`[NEWSLETTER] Admin failed to list subscribers: ${err.message}`);
    next(err);
  }
};
