import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { sendOtpEmail } from '../services/emailService';

const JWT_SECRET = process.env.JWT_SECRET || 'AristaTrinketsJwtSecretKey2026';
const JWT_EXPIRES_IN = '24h';

export const registerUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const [existing]: any = await pool.query(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, message: 'An account with this email address already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result]: any = await pool.query(
      `INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, 'CUSTOMER')`,
      [name.trim(), cleanEmail, hashedPassword, phone ? phone.trim() : null]
    );

    const userId = result.insertId;
    const token = jwt.sign({ userId, email: cleanEmail, role: 'CUSTOMER' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    logger.info(`New customer registered: ${cleanEmail} (ID: ${userId})`);
    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: {
        user: { id: userId, name: name.trim(), email: cleanEmail, role: 'CUSTOMER' },
        token
      }
    });
  } catch (err) {
    next(err);
  }
};

export const loginUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const [rows]: any = await pool.query(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
    if (!rows || rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    logger.info(`User logged in: ${user.email} (${user.role})`);
    return res.status(200).json({
      success: true,
      message: 'Sign in successful.',
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        token
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized. Token required.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded: any = jwt.verify(token, JWT_SECRET);

    return res.status(200).json({
      success: true,
      data: {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role
      }
    });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const [users]: any = await pool.query(`SELECT id FROM users WHERE email = ?`, [cleanEmail]);
    if (!users || users.length === 0) {
      return res.status(404).json({ success: false, message: 'No account registered with this email address.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, ?)`,
      [cleanEmail, otp, expiresAt]
    );

    logger.info(`[FORGOT-PASSWORD] 6-digit OTP code for ${cleanEmail} is ${otp}`);

    await sendOtpEmail(cleanEmail, otp);

    return res.status(200).json({
      success: true,
      message: 'A 6-digit security verification code has been sent to your email address.'
    });
  } catch (err) {
    next(err);
  }
};

export const verifyOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and verification code are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    const [rows]: any = await pool.query(
      `SELECT id FROM password_resets WHERE email = ? AND otp = ? AND used = FALSE AND expires_at > NOW() ORDER BY id DESC LIMIT 1`,
      [cleanEmail, cleanOtp]
    );

    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired 6-digit verification code.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Verification code verified successfully.'
    });
  } catch (err) {
    next(err);
  }
};

export const resetPasswordWithOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, OTP code, and new password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    const [rows]: any = await pool.query(
      `SELECT id FROM password_resets WHERE email = ? AND otp = ? AND used = FALSE AND expires_at > NOW() ORDER BY id DESC LIMIT 1`,
      [cleanEmail, cleanOtp]
    );

    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
    }

    const resetRecordId = rows[0].id;
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await pool.query(`UPDATE users SET password = ? WHERE email = ?`, [hashedPassword, cleanEmail]);
    await pool.query(`UPDATE password_resets SET used = TRUE WHERE id = ?`, [resetRecordId]);

    logger.info(`[FORGOT-PASSWORD] Password reset successful for ${cleanEmail}`);

    return res.status(200).json({
      success: true,
      message: 'Your password has been reset successfully! You can now sign in with your new password.'
    });
  } catch (err) {
    next(err);
  }
};
