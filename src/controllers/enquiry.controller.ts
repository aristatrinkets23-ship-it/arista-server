import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { ApiResponse } from '../utils/api-response';
import { logger } from '../utils/logger';
import { sendEnquiryNotification } from '../services/emailService';

/**
 * Handle new customer enquiry submission from the contact form
 */
export const createEnquiry = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info(`[ENQUIRY] Received new enquiry submission: ${JSON.stringify(req.body)}`);
    const { name, email, phone, subject, message } = req.body || {};

    // 1. Validation
    if (!name || !email || !message) {
      return res.status(400).json(
        ApiResponse.error('Name, email, and message are required fields.', 400)
      );
    }

    const trimmedName = String(name).trim();
    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedPhone = phone ? String(phone).trim() : null;
    const trimmedSubject = subject ? String(subject).trim() : 'Bespoke Design Inquiry';
    const trimmedMessage = String(message).trim();

    if (!trimmedName || !trimmedEmail || !trimmedMessage) {
      return res.status(400).json(
        ApiResponse.error('Name, email, and message cannot be empty.', 400)
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(trimmedEmail)) {
      logger.warn(`[ENQUIRY] Validation failed for email string: "${trimmedEmail}"`);
      return res.status(400).json(
        ApiResponse.error('Please enter a valid email address.', 400)
      );
    }

    if (trimmedPhone) {
      const phoneRegex = /^\d{10}$/;
      if (!phoneRegex.test(trimmedPhone)) {
        logger.warn(`[ENQUIRY] Validation failed for phone number: "${trimmedPhone}"`);
        return res.status(400).json(
          ApiResponse.error('Phone number must be exactly 10 digits.', 400)
        );
      }
    }

    // 2. Save to MySQL SQL database
    const insertQuery = `
      INSERT INTO enquiries (name, email, phone, subject, message)
      VALUES (?, ?, ?, ?, ?)
    `;

    const [result]: any = await pool.query(insertQuery, [
      trimmedName,
      trimmedEmail,
      trimmedPhone,
      trimmedSubject,
      trimmedMessage
    ]);

    const enquiryId = result.insertId;
    logger.info(`Enquiry #${enquiryId} successfully saved to SQL database from ${trimmedEmail}`);

    // 3. Send Nodemailer email notification
    const emailSent = await sendEnquiryNotification({
      name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone || undefined,
      subject: trimmedSubject,
      message: trimmedMessage
    });

    if (!emailSent) {
      logger.error(`[ENQUIRY] Email failed to send for enquiry #${enquiryId}`);
      return res.status(500).json(
        ApiResponse.error('Email could not be sent. Please check email settings or try again later.', 500)
      );
    }

    // 4. Return successful response to Angular frontend
    return res.status(201).json(
      ApiResponse.created('Thank you for reaching out! Your message has been sent to our Atelier Concierge.', {
        id: enquiryId,
        name: trimmedName,
        email: trimmedEmail,
        emailSent: true,
        createdAt: new Date().toISOString()
      })
    );
  } catch (err: any) {
    logger.error('Failed to process customer enquiry in database:', err);
    next(err);
  }
};

/**
 * Admin action to fetch submitted customer enquiries
 */
export const getEnquiries = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows]: any = await pool.query('SELECT * FROM enquiries ORDER BY created_at DESC');
    return res.status(200).json(ApiResponse.success('Enquiries retrieved successfully', rows));
  } catch (err) {
    next(err);
  }
};
