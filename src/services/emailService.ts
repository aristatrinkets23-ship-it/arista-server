import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';

export interface EnquiryEmailData {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
}

/**
 * Sends a clean, professional Nodemailer notification email when a new customer enquiry is submitted.
 */
export const sendEnquiryNotification = async (enquiry: EnquiryEmailData): Promise<boolean> => {
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.EMAIL_PORT || process.env.SMTP_PORT || 587);
  const secure = (process.env.EMAIL_SECURE || process.env.SMTP_SECURE) === 'true';
  const user = process.env.EMAIL_USER || process.env.SMTP_USER || '';
  const pass = process.env.EMAIL_PASSWORD || process.env.SMTP_PASS || '';
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || '';

  if (!adminEmail) {
    logger.warn('[EMAIL] ADMIN_NOTIFICATION_EMAIL is not configured in process.env. Skipping notification email.');
    return false;
  }

  try {
    let transporter: Transporter;
    let senderAddress = process.env.EMAIL_FROM || user || 'concierge@aristatrinkets.com';

    if (user && pass) {
      // Use direct service (e.g. gmail) or configured SMTP
      if (process.env.EMAIL_SERVICE || host === 'smtp.gmail.com' || host === 'gmail') {
        transporter = nodemailer.createTransport({
          service: process.env.EMAIL_SERVICE || 'gmail',
          auth: {
            user,
            pass
          }
        });
      } else {
        transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: {
            user,
            pass
          }
        });
      }
    } else {
      // Zero-setup development mode: automatically create a Nodemailer test account
      logger.info('[EMAIL] No email credentials provided. Creating an automatic Nodemailer test account...');
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      senderAddress = testAccount.user;
      logger.info(`[EMAIL] Using ephemeral test account: ${testAccount.user}`);
    }

    const mailSubject = enquiry.subject
      ? `New Customer Enquiry - ${enquiry.subject}`
      : 'New Customer Enquiry - Jewelry Website';

    const safeName = escapeHtml(enquiry.name);
    const safeEmail = escapeHtml(enquiry.email);
    const safePhone = enquiry.phone ? escapeHtml(enquiry.phone) : 'N/A';
    const safeSubject = enquiry.subject ? escapeHtml(enquiry.subject) : 'General Inquiry';
    const safeMessage = escapeHtml(enquiry.message);

    const emailHtml = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333333; max-width: 620px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: #1a120b; padding: 24px 20px; text-align: center;">
          <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: #d4af37; letter-spacing: 2px; text-transform: uppercase;">ARISTA TRINKETS</h2>
          <p style="margin: 6px 0 0 0; font-size: 12px; color: #e2d9cc; text-transform: uppercase; letter-spacing: 1.5px;">Luxury Concierge Notification</p>
        </div>
        <div style="padding: 28px 24px; background-color: #faf8f5;">
          <h3 style="margin-top: 0; margin-bottom: 18px; color: #1a120b; font-size: 18px; font-weight: 600; border-bottom: 2px solid #d4af37; padding-bottom: 10px;">
            New Customer Enquiry Received
          </h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
            <tr style="border-bottom: 1px solid #eeeeee;">
              <td style="padding: 10px 0; font-weight: 600; width: 140px; color: #666666;">Customer Name:</td>
              <td style="padding: 10px 0; color: #1a120b; font-weight: 500;">${safeName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eeeeee;">
              <td style="padding: 10px 0; font-weight: 600; color: #666666;">Email Address:</td>
              <td style="padding: 10px 0; color: #1a120b;"><a href="mailto:${safeEmail}" style="color: #8b6b3e; text-decoration: underline;">${safeEmail}</a></td>
            </tr>
            <tr style="border-bottom: 1px solid #eeeeee;">
              <td style="padding: 10px 0; font-weight: 600; color: #666666;">Phone Number:</td>
              <td style="padding: 10px 0; color: #1a120b;">${safePhone}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eeeeee;">
              <td style="padding: 10px 0; font-weight: 600; color: #666666;">Subject:</td>
              <td style="padding: 10px 0; color: #1a120b;">${safeSubject}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; font-weight: 600; color: #666666;">Received At:</td>
              <td style="padding: 10px 0; color: #1a120b;">${new Date().toLocaleString()}</td>
            </tr>
          </table>
          <div style="background-color: #ffffff; padding: 20px; border-left: 4px solid #d4af37; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <h4 style="margin: 0 0 10px 0; color: #1a120b; font-size: 15px; font-weight: 600;">Message Content:</h4>
            <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #444444;">${safeMessage}</p>
          </div>
        </div>
        <div style="background-color: #f3efe9; padding: 16px 20px; text-align: center; font-size: 12px; color: #777777;">
          <p style="margin: 0;">This automated notification was generated by the Arista Trinkets backend API.</p>
        </div>
      </div>
    `;
    const info = await transporter.sendMail({
      from: senderAddress,
      to: adminEmail,
      replyTo: enquiry.email,
      subject: mailSubject,
      html: emailHtml,
      text: `New Customer Enquiry\n\nName: ${enquiry.name}\nEmail: ${enquiry.email}\nPhone: ${enquiry.phone || 'N/A'}\nSubject: ${enquiry.subject || 'N/A'}\nMessage:\n${enquiry.message}`
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info(`[EMAIL] 📧 Nodemailer preview URL: ${previewUrl}`);
    }
    logger.info(`[EMAIL] Nodemailer enquiry notification sent to ${adminEmail}. MessageID: ${info.messageId}`);
    return true;
  } catch (error: any) {
    logger.error(`[EMAIL] Nodemailer sendMail error: ${error.message}`);
    // DO NOT rethrow so SQL enquiry record remains saved and client receives success response
    return false;
  }
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
