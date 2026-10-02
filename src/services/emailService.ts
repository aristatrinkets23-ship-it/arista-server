import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UTILITY
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Builds and returns a configured Nodemailer transporter.
 * Falls back to an auto-created Ethereal test account in dev if no credentials provided.
 */
const createTransporter = async (): Promise<{ transporter: Transporter; senderAddress: string }> => {
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.EMAIL_PORT || process.env.SMTP_PORT || 587);
  const secure = (process.env.EMAIL_SECURE || process.env.SMTP_SECURE) === 'true';
  const user = process.env.EMAIL_USER || process.env.SMTP_USER || '';
  const pass = process.env.EMAIL_PASSWORD || process.env.SMTP_PASS || '';
  let senderAddress = process.env.EMAIL_FROM || user || 'concierge@aristatrinkets.com';

  if (user && pass) {
    const useService = !!(process.env.EMAIL_SERVICE || host === 'smtp.gmail.com' || host === 'gmail');
    const transporter = useService
      ? nodemailer.createTransport({ service: process.env.EMAIL_SERVICE || 'gmail', auth: { user, pass } })
      : nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
    return { transporter, senderAddress };
  }

  // Dev fallback — Ethereal auto-account
  logger.info('[EMAIL] No credentials. Creating Ethereal test account...');
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass }
  });
  senderAddress = testAccount.user;
  logger.info(`[EMAIL] Using ephemeral test account: ${testAccount.user}`);
  return { transporter, senderAddress };
};

// ─────────────────────────────────────────────────────────────────────────────
// ENQUIRY NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export interface EnquiryEmailData {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
}

/**
 * Sends a notification email to the admin when a new customer enquiry is submitted.
 */
export const sendEnquiryNotification = async (enquiry: EnquiryEmailData): Promise<boolean> => {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || '';

  if (!adminEmail) {
    logger.warn('[EMAIL] ADMIN_NOTIFICATION_EMAIL is not configured. Skipping enquiry email.');
    return false;
  }

  try {
    const { transporter, senderAddress } = await createTransporter();

    const mailSubject = enquiry.subject
      ? `New Customer Enquiry - ${enquiry.subject}`
      : 'New Customer Enquiry - Arista Trinkets';

    const safeName    = escapeHtml(enquiry.name);
    const safeEmail   = escapeHtml(enquiry.email);
    const safePhone   = enquiry.phone ? escapeHtml(enquiry.phone) : 'N/A';
    const safeSubject = enquiry.subject ? escapeHtml(enquiry.subject) : 'General Inquiry';
    const safeMessage = escapeHtml(enquiry.message);

    const emailHtml = `
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#333;max-width:620px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;background:#fff;">
        <div style="background:#1a120b;padding:24px 20px;text-align:center;">
          <h2 style="margin:0;font-size:24px;font-weight:700;color:#d4af37;letter-spacing:2px;text-transform:uppercase;">ARISTA TRINKETS</h2>
          <p style="margin:6px 0 0;font-size:12px;color:#e2d9cc;text-transform:uppercase;letter-spacing:1.5px;">Luxury Concierge Notification</p>
        </div>
        <div style="padding:28px 24px;background:#faf8f5;">
          <h3 style="margin-top:0;margin-bottom:18px;color:#1a120b;font-size:18px;font-weight:600;border-bottom:2px solid #d4af37;padding-bottom:10px;">New Customer Enquiry Received</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;">
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;font-weight:600;width:140px;color:#666;">Customer Name:</td><td style="padding:10px 0;color:#1a120b;font-weight:500;">${safeName}</td></tr>
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;font-weight:600;color:#666;">Email:</td><td style="padding:10px 0;color:#1a120b;"><a href="mailto:${safeEmail}" style="color:#8b6b3e;">${safeEmail}</a></td></tr>
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;font-weight:600;color:#666;">Phone:</td><td style="padding:10px 0;color:#1a120b;">${safePhone}</td></tr>
            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;font-weight:600;color:#666;">Subject:</td><td style="padding:10px 0;color:#1a120b;">${safeSubject}</td></tr>
            <tr><td style="padding:10px 0;font-weight:600;color:#666;">Received At:</td><td style="padding:10px 0;color:#1a120b;">${new Date().toLocaleString()}</td></tr>
          </table>
          <div style="background:#fff;padding:20px;border-left:4px solid #d4af37;border-radius:4px;">
            <h4 style="margin:0 0 10px;color:#1a120b;font-size:15px;font-weight:600;">Message:</h4>
            <p style="margin:0;white-space:pre-wrap;font-size:14px;line-height:1.6;color:#444;">${safeMessage}</p>
          </div>
        </div>
        <div style="background:#f3efe9;padding:16px 20px;text-align:center;font-size:12px;color:#777;">
          <p style="margin:0;">This automated notification was generated by the Arista Trinkets backend API.</p>
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
    if (previewUrl) logger.info(`[EMAIL] Preview URL: ${previewUrl}`);
    logger.info(`[EMAIL] Enquiry notification sent to ${adminEmail}. MessageID: ${info.messageId}`);
    return true;
  } catch (error: any) {
    logger.error(`[EMAIL] sendEnquiryNotification error: ${error.message}`);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ORDER CONFIRMATION EMAIL
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderEmailItem {
  product_name: string;
  unit_price: number;
  quantity: number;
  metal_type?: string;
  total_price: number;
}

export interface OrderEmailData {
  orderNumber: string;
  trackingCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  city: string;
  state: string;
  pincode: string;
  items: OrderEmailItem[];
  subtotal: number;
  shippingFee: number;
  tax: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  createdAt: string;
}

/**
 * Sends a full order confirmation notification to ADMIN_EMAIL when a new order is placed.
 * Includes: order details, tracking code, shipping address, itemised table, and pricing summary.
 */
export const sendOrderConfirmationEmail = async (order: OrderEmailData): Promise<boolean> => {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL || '';

  if (!adminEmail) {
    logger.warn('[EMAIL] ADMIN_NOTIFICATION_EMAIL is not configured. Skipping order confirmation email.');
    return false;
  }

  try {
    const { transporter, senderAddress } = await createTransporter();

    // Build items rows
    const itemRows = order.items.map(item => `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 8px;color:#1a120b;font-size:14px;">${escapeHtml(item.product_name)}</td>
        <td style="padding:10px 8px;color:#666;font-size:13px;text-align:center;">${escapeHtml(item.metal_type || '—')}</td>
        <td style="padding:10px 8px;text-align:center;color:#1a120b;font-size:14px;">${item.quantity}</td>
        <td style="padding:10px 8px;text-align:right;color:#1a120b;font-size:14px;">₹${Number(item.unit_price).toLocaleString('en-IN')}</td>
        <td style="padding:10px 8px;text-align:right;color:#1a120b;font-weight:600;font-size:14px;">₹${Number(item.total_price).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');

    const statusBadgeColor = order.orderStatus === 'DELIVERED' ? '#22c55e'
      : order.orderStatus === 'SHIPPED'     ? '#3b82f6'
      : order.orderStatus === 'PROCESSING'  ? '#f59e0b'
      : order.orderStatus === 'CANCELLED'   ? '#ef4444'
      : '#6b7280';

    const paymentBadgeColor = order.paymentStatus === 'PAID' ? '#22c55e'
      : order.paymentStatus === 'FAILED'    ? '#ef4444'
      : '#f59e0b';

    const emailHtml = `
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#333;max-width:680px;margin:0 auto;border:1px solid #e0e0e0;border-radius:10px;overflow:hidden;background:#fff;">

        <!-- Header -->
        <div style="background:#1a120b;padding:28px 24px;text-align:center;">
          <h2 style="margin:0;font-size:26px;font-weight:700;color:#d4af37;letter-spacing:2px;text-transform:uppercase;">ARISTA TRINKETS</h2>
          <p style="margin:8px 0 0;font-size:13px;color:#e2d9cc;text-transform:uppercase;letter-spacing:1.5px;">New Order Received</p>
        </div>

        <!-- Order Banner -->
        <div style="background:#fefdf9;padding:20px 24px;border-bottom:1px solid #e8e0d4;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <p style="margin:0;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px;">Order Number</p>
            <h3 style="margin:4px 0 0;font-size:22px;font-weight:700;color:#1a120b;letter-spacing:1px;">${escapeHtml(order.orderNumber)}</h3>
          </div>
          <div style="text-align:right;">
            <p style="margin:0;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px;">Tracking Code</p>
            <h3 style="margin:4px 0 0;font-size:16px;font-weight:700;color:#8b6b3e;font-family:monospace;">${escapeHtml(order.trackingCode)}</h3>
          </div>
          <div style="text-align:right;">
            <p style="margin:0;font-size:13px;color:#888;">Placed At</p>
            <p style="margin:4px 0 0;font-size:13px;color:#1a120b;font-weight:500;">${new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        </div>

        <div style="padding:24px;">

          <!-- Status Badges -->
          <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
            <span style="background:${statusBadgeColor};color:#fff;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Order: ${order.orderStatus}</span>
            <span style="background:${paymentBadgeColor};color:#fff;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Payment: ${order.paymentStatus}</span>
            <span style="background:#e8e0d4;color:#1a120b;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(order.paymentMethod)}</span>
          </div>

          <!-- Customer & Shipping -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
            <div style="background:#faf8f5;padding:16px;border-radius:8px;border:1px solid #e8e0d4;">
              <h4 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#888;">Customer Details</h4>
              <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#1a120b;">${escapeHtml(order.customerName)}</p>
              <p style="margin:0 0 6px;font-size:13px;color:#555;"><a href="mailto:${escapeHtml(order.customerEmail)}" style="color:#8b6b3e;">${escapeHtml(order.customerEmail)}</a></p>
              <p style="margin:0;font-size:13px;color:#555;">📞 ${escapeHtml(order.customerPhone)}</p>
            </div>
            <div style="background:#faf8f5;padding:16px;border-radius:8px;border:1px solid #e8e0d4;">
              <h4 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#888;">Shipping Address</h4>
              <p style="margin:0;font-size:13px;color:#1a120b;line-height:1.6;">
                ${escapeHtml(order.shippingAddress)}<br>
                ${escapeHtml(order.city)}, ${escapeHtml(order.state)}<br>
                Pincode: ${escapeHtml(order.pincode)}
              </p>
            </div>
          </div>

          <!-- Order Items Table -->
          <h4 style="margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#888;border-bottom:2px solid #d4af37;padding-bottom:8px;">Order Items</h4>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <thead>
              <tr style="background:#1a120b;color:#d4af37;">
                <th style="padding:10px 8px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Product</th>
                <th style="padding:10px 8px;text-align:center;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Metal</th>
                <th style="padding:10px 8px;text-align:center;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Qty</th>
                <th style="padding:10px 8px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Unit Price</th>
                <th style="padding:10px 8px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Total</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>

          <!-- Pricing Summary -->
          <div style="background:#faf8f5;padding:16px 20px;border-radius:8px;border:1px solid #e8e0d4;margin-bottom:8px;">
            <table style="width:100%;font-size:14px;">
              <tr><td style="padding:6px 0;color:#666;">Subtotal</td><td style="padding:6px 0;text-align:right;color:#1a120b;">₹${Number(order.subtotal).toLocaleString('en-IN')}</td></tr>
              <tr><td style="padding:6px 0;color:#666;">Shipping</td><td style="padding:6px 0;text-align:right;color:#1a120b;">₹${Number(order.shippingFee).toLocaleString('en-IN')}</td></tr>
              <tr><td style="padding:6px 0;color:#666;">Tax</td><td style="padding:6px 0;text-align:right;color:#1a120b;">₹${Number(order.tax).toLocaleString('en-IN')}</td></tr>
              <tr style="border-top:2px solid #d4af37;">
                <td style="padding:10px 0 0;font-weight:700;font-size:15px;color:#1a120b;">Total Amount</td>
                <td style="padding:10px 0 0;text-align:right;font-weight:700;font-size:18px;color:#1a120b;">₹${Number(order.totalAmount).toLocaleString('en-IN')}</td>
              </tr>
            </table>
          </div>

        </div>

        <!-- Footer -->
        <div style="background:#f3efe9;padding:16px 20px;text-align:center;font-size:12px;color:#777;">
          <p style="margin:0;">This notification was auto-generated by the Arista Trinkets backend. Order #${escapeHtml(order.orderNumber)}</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: senderAddress,
      to: adminEmail,
      subject: `🛍️ New Order ${order.orderNumber} — ₹${Number(order.totalAmount).toLocaleString('en-IN')} | ${order.customerName}`,
      html: emailHtml,
      text: [
        `NEW ORDER RECEIVED — Arista Trinkets`,
        `Order Number : ${order.orderNumber}`,
        `Tracking Code: ${order.trackingCode}`,
        `Customer     : ${order.customerName} <${order.customerEmail}> | ${order.customerPhone}`,
        `Address      : ${order.shippingAddress}, ${order.city}, ${order.state} - ${order.pincode}`,
        `Order Status : ${order.orderStatus}`,
        `Payment      : ${order.paymentStatus} via ${order.paymentMethod}`,
        `Total Amount : ₹${Number(order.totalAmount).toLocaleString('en-IN')}`,
        ``,
        `ITEMS:`,
        ...order.items.map(i => `  - ${i.product_name} x${i.quantity} @ ₹${i.unit_price} = ₹${i.total_price}`),
        ``,
        `Placed At: ${new Date(order.createdAt).toLocaleString()}`
      ].join('\n')
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) logger.info(`[EMAIL] Order email preview: ${previewUrl}`);
    logger.info(`[EMAIL] Order confirmation email sent to ${adminEmail} for order ${order.orderNumber}`);
    return true;
  } catch (error: any) {
    logger.error(`[EMAIL] sendOrderConfirmationEmail error: ${error.message}`);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// OTP PASSWORD RESET EMAIL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a 6-digit OTP verification code email to customer for password reset.
 */
export const sendOtpEmail = async (toEmail: string, otp: string): Promise<boolean> => {
  try {
    const { transporter, senderAddress } = await createTransporter();
    const safeEmail = escapeHtml(toEmail);

    const emailHtml = `
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#333;max-width:540px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;background:#fff;">
        <div style="background:#1a120b;padding:24px 20px;text-align:center;">
          <h2 style="margin:0;font-size:24px;font-weight:700;color:#d4af37;letter-spacing:2px;text-transform:uppercase;">ARISTA TRINKETS</h2>
          <p style="margin:6px 0 0;font-size:12px;color:#e2d9cc;text-transform:uppercase;letter-spacing:1.5px;">Atelier Security Concierge</p>
        </div>
        <div style="padding:32px 24px;background:#faf8f5;text-align:center;">
          <h3 style="margin-top:0;margin-bottom:12px;color:#1a120b;font-size:20px;font-weight:600;">Password Reset Verification Code</h3>
          <p style="margin-bottom:24px;font-size:14px;color:#666;line-height:1.5;">
            We received a request to reset the password for your Arista Trinkets account (<strong>${safeEmail}</strong>).
          </p>
          <div style="background:#fff;border:2px dashed #cfa874;border-radius:8px;padding:20px 16px;margin:0 auto 24px auto;max-width:280px;">
            <span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#5b4636;font-family:monospace;">${otp}</span>
          </div>
          <p style="font-size:13px;color:#888;margin:0;">
            This 6-digit security code is valid for <strong>15 minutes</strong>. Do not share this code with anyone.
          </p>
        </div>
        <div style="background:#f3efe9;padding:16px 20px;text-align:center;font-size:12px;color:#777;">
          <p style="margin:0;">If you did not request a password reset, please ignore this email.</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: senderAddress,
      to: toEmail,
      subject: `🔒 Your Arista Password Reset Code: ${otp}`,
      html: emailHtml,
      text: `Your Arista Trinkets 6-digit password reset verification code is: ${otp}\nValid for 15 minutes.`
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info(`[EMAIL] OTP Email Preview URL: ${previewUrl}`);
    }
    logger.info(`[EMAIL] OTP ${otp} sent to ${toEmail}. MessageID: ${info.messageId}`);
    return true;
  } catch (error: any) {
    logger.error(`[EMAIL] sendOtpEmail error: ${error.message}`);
    return false;
  }
};
