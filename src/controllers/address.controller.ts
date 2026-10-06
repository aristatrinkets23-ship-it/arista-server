import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

/**
 * GET /api/v1/addresses
 * Fetches saved shipping addresses for logged in user or email query
 */
export const getUserAddresses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const email = req.query.email || (user ? user.email : null);
    const userId = user ? user.id : null;

    if (!email && !userId) {
      return res.status(200).json({ success: true, data: [] });
    }

    let query = `SELECT * FROM user_addresses WHERE 1=0`;
    const queryParams: any[] = [];

    if (userId) {
      query += ` OR user_id = ?`;
      queryParams.push(userId);
    }
    if (email) {
      query += ` OR LOWER(user_email) = LOWER(?)`;
      queryParams.push(String(email).trim());
    }

    query += ` ORDER BY is_default DESC, id DESC`;

    const [rows]: any = await pool.query(query, queryParams);
    return res.status(200).json({ success: true, data: rows || [] });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/addresses
 * Adds a new shipping address
 */
export const addAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const { fullName, phone, addressLine, city, state, pincode, isDefault, email } = req.body;
    const userEmail = email || (user ? user.email : null);
    const userId = user ? user.id : null;

    if (!fullName || !phone || !addressLine || !city || !state || !pincode || !userEmail) {
      return res.status(400).json({ success: false, message: 'Full name, phone, address, city, state, PIN code, and email are required.' });
    }

    // Validate Indian PIN code — must be exactly 6 digits
    const cleanPin = String(pincode).trim().replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanPin)) {
      return res.status(400).json({ success: false, message: 'PIN code must be exactly 6 digits (e.g. 395003).' });
    }

    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) as total FROM user_addresses WHERE user_id = ? OR LOWER(user_email) = LOWER(?)`,
      [userId || 0, String(userEmail).trim()]
    );
    const totalExisting = Number(countRows[0]?.total || 0);
    const makeDefault = isDefault || totalExisting === 0;

    if (makeDefault) {
      await pool.query(
        `UPDATE user_addresses SET is_default = FALSE WHERE user_id = ? OR LOWER(user_email) = LOWER(?)`,
        [userId || 0, String(userEmail).trim()]
      );
    }

    const [result]: any = await pool.query(
      `INSERT INTO user_addresses (user_id, user_email, full_name, phone, address_line, city, state, pincode, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId || null, String(userEmail).trim(), fullName.trim(), phone.trim(), addressLine.trim(), city.trim(), state.trim(), pincode.trim(), makeDefault ? 1 : 0]
    );

    logger.info(`New address created ID: ${result.insertId} for ${userEmail}`);
    return res.status(201).json({
      success: true,
      message: 'Shipping address saved successfully.',
      data: {
        id: result.insertId,
        userId,
        userEmail,
        fullName,
        phone,
        addressLine,
        city,
        state,
        pincode,
        isDefault: makeDefault
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/addresses/:id
 * Updates an existing address
 */
export const updateAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { fullName, phone, addressLine, city, state, pincode, isDefault, email } = req.body;
    const user = (req as any).user;
    const userEmail = email || (user ? user.email : null);

    if (isDefault && userEmail) {
      await pool.query(
        `UPDATE user_addresses SET is_default = FALSE WHERE LOWER(user_email) = LOWER(?) OR id = ?`,
        [String(userEmail).trim(), id]
      );
    }

    await pool.query(
      `UPDATE user_addresses SET 
        full_name = COALESCE(?, full_name),
        phone = COALESCE(?, phone),
        address_line = COALESCE(?, address_line),
        city = COALESCE(?, city),
        state = COALESCE(?, state),
        pincode = COALESCE(?, pincode),
        is_default = COALESCE(?, is_default),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [fullName, phone, addressLine, city, state, pincode, isDefault !== undefined ? (isDefault ? 1 : 0) : null, id]
    );

    return res.status(200).json({ success: true, message: 'Shipping address updated successfully.' });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/addresses/:id
 */
export const deleteAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM user_addresses WHERE id = ?`, [id]);
    return res.status(200).json({ success: true, message: 'Address removed successfully.' });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/addresses/:id/default
 */
export const setDefaultAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const email = req.body.email || req.query.email || (user ? user.email : null);

    if (email) {
      await pool.query(
        `UPDATE user_addresses SET is_default = FALSE WHERE LOWER(user_email) = LOWER(?)`,
        [String(email).trim()]
      );
    }

    await pool.query(`UPDATE user_addresses SET is_default = TRUE WHERE id = ?`, [id]);
    return res.status(200).json({ success: true, message: 'Default address updated.' });
  } catch (err) {
    next(err);
  }
};
