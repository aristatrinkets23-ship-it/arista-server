import { Request, Response, NextFunction } from 'express';
import { createRazorpayOrder, verifyRazorpayPaymentSignature } from '../services/razorpay.service';
import { sendOrderConfirmationEmail } from '../services/emailService';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { getStoreSettings } from '../services/storeSettings.service';
import { generateInvoicePdf } from '../services/invoicePdf.service';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a sequential, unique alphanumeric order number.
 *
 * Format : ART-XXXXXX  (prefix + 6-digit zero-padded counter)
 * Examples: ART-000001 → ART-000002 → ART-000123
 */
const generateOrderNumber = async (): Promise<string> => {
  const PREFIX = 'ART-';
  const PAD_LENGTH = 6;

  try {
    const [rows]: any = await pool.query(
      `SELECT order_number FROM orders
       WHERE order_number REGEXP '^ART-[0-9]+$'
       ORDER BY CAST(SUBSTRING(order_number, ?) AS UNSIGNED) DESC
       LIMIT 1`,
      [PREFIX.length + 1]
    );

    if (rows && rows.length > 0) {
      const lastOrderNumber: string = rows[0].order_number;
      const numericPart = lastOrderNumber.substring(PREFIX.length);
      const lastCount = parseInt(numericPart, 10);
      const nextCount = isNaN(lastCount) ? 1 : lastCount + 1;
      return `${PREFIX}${String(nextCount).padStart(PAD_LENGTH, '0')}`;
    }

    return `${PREFIX}${'1'.padStart(PAD_LENGTH, '0')}`;
  } catch (err: any) {
    logger.error(`generateOrderNumber DB query failed: ${err.message}`);
    throw new Error(`Sequential order number generation failed: ${err.message}`);
  }
};

/**
 * Generates a unique alphanumeric tracking code stored per order.
 *
 * Format : TRK-XXXXXXXXXXXXXXXX  (TRK- prefix + 12 random uppercase alphanumeric chars)
 * Example: TRK-A3FG92KLM7PQ
 *
 * Uniqueness: checked against the DB before returning. Retries up to 5 times.
 */
const TRACKING_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const generateTrackingCode = async (): Promise<string> => {
  const PREFIX = 'TRK-';
  const CODE_LENGTH = 12;

  for (let attempt = 0; attempt < 5; attempt++) {
    // Build random alphanumeric suffix
    let suffix = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      suffix += TRACKING_CHARS.charAt(Math.floor(Math.random() * TRACKING_CHARS.length));
    }
    const trackingCode = `${PREFIX}${suffix}`;

    try {
      // Check uniqueness against the DB
      const [existing]: any = await pool.query(
        `SELECT id FROM orders WHERE tracking_code = ? LIMIT 1`,
        [trackingCode]
      );
      if (!existing || existing.length === 0) {
        return trackingCode;  // Unique — safe to use
      }
      logger.warn(`Tracking code collision on attempt ${attempt + 1}: ${trackingCode}. Retrying...`);
    } catch (err: any) {
      // DB unavailable — return the generated code and let the INSERT handle any conflict
      logger.warn(`generateTrackingCode DB check failed: ${err.message}. Using code without uniqueness check.`);
      return trackingCode;
    }
  }

  // Extremely unlikely — fallback to timestamp-based suffix
  return `${PREFIX}${Date.now().toString(36).toUpperCase().slice(-12).padStart(12, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates Razorpay Order for Checkout
 */
export const createPaymentOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, receipt, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid payment amount is required.' });
    }

    const orderReceipt = receipt || `REC-${Date.now()}`;
    const razorpayOrder = await createRazorpayOrder({
      amountInINR: Number(amount),
      receipt: orderReceipt,
      notes: notes || {}
    });

    return res.status(200).json({
      success: true,
      message: 'Razorpay order initialized successfully.',
      data: razorpayOrder
    });
  } catch (err: any) {
    logger.error(`createPaymentOrder error: ${err.message}`);
    next(err);
  }
};

/**
 * Verifies Razorpay Payment Signature and Updates Order
 */
export const verifyPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_number } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required Razorpay payment verification parameters.'
      });
    }

    const isValid = verifyRazorpayPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Razorpay payment signature verification failed.'
      });
    }

    try {
      if (order_number) {
        await pool.query(
          `UPDATE orders SET payment_status = 'PAID', razorpay_order_id = ?, razorpay_payment_id = ?, order_status = 'PROCESSING' WHERE order_number = ?`,
          [razorpay_order_id, razorpay_payment_id, order_number]
        );
      }
    } catch (dbErr) {
      logger.warn('MySQL DB update skipped during payment verification fallback.');
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully.',
      data: {
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        status: 'PAID'
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Creates Order Record
 * Generates both a sequential order number (ART-000001) and a
 * unique alphanumeric tracking code (TRK-XXXXXXXXXXXXXXXX) stored in the DB.
 */
export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      customerName, customerEmail, customerPhone,
      shippingAddress, city, state, pincode,
      items, totalAmount, paymentMethod
    } = req.body;

    if (!shippingAddress || !shippingAddress.trim() || !city || !city.trim() || !pincode || !pincode.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Shipping address, city, and PIN code are required to place an order.'
      });
    }

    // Validate PIN code — must be exactly 6 digits
    const cleanPincode = String(pincode).trim().replace(/\D/g, '');
    if (!/^\d{6}$/.test(cleanPincode)) {
      return res.status(400).json({
        success: false,
        message: 'PIN code must be exactly 6 digits (e.g. 395003).'
      });
    }

    const cleanPhone = (customerPhone || '').replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length !== 10) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile phone number.'
      });
    }

    // 1. Generate sequential order number  →  ART-000001, ART-000002, …
    const orderNumber = await generateOrderNumber();

    // 2. Fetch Active Store Settings from Database
    const storeSettings = await getStoreSettings();

    // 3. Recalculate Subtotal from items
    let calculatedSubtotal = 0;
    if (items && Array.isArray(items)) {
      calculatedSubtotal = items.reduce((acc: number, it: any) => {
        const p = Number(it.price) || 0;
        const q = Number(it.quantity) || 1;
        return acc + (p * q);
      }, 0);
    }
    if (calculatedSubtotal === 0 && totalAmount) {
      calculatedSubtotal = Number(totalAmount);
    }

    // 4. Calculate Delivery Fee based on DB Free-Delivery Threshold
    const freeThreshold = Number(storeSettings.freeDeliveryThreshold) || 600;
    const baseDeliveryFee = Number(storeSettings.deliveryCharge) !== undefined ? Number(storeSettings.deliveryCharge) : 50;
    const calculatedShipping = (calculatedSubtotal >= freeThreshold || calculatedSubtotal === 0) ? 0 : baseDeliveryFee;

    // 5. Calculate GST Tax
    const gstRate = Number(storeSettings.gstPercentage) || 3.0;
    const calculatedTax = Math.round(calculatedSubtotal * (gstRate / 100));

    // 6. Calculate Final Total Amount
    const finalTotalAmount = calculatedSubtotal + calculatedShipping + calculatedTax;

    // 7. Generate Deterministic Invoice Number: INV-YYYY-XXXXXX
    const currentYear = new Date().getFullYear();
    const cleanNum = orderNumber.replace(/\D/g, '').padStart(6, '0');
    const invoiceNumber = `${storeSettings.invoicePrefix || 'INV-'}${currentYear}-${cleanNum}`;

    // Tracking code is NULL on creation; assigned when dispatched by Admin
    const trackingCode: string | null = null;

    let orderId: number | null = null;

    try {
      // Primary INSERT with invoice_number, subtotal, shipping_fee, tax, and total_amount
      const [result]: any = await pool.query(
        `INSERT INTO orders
          (order_number, invoice_number, tracking_code, customer_name, customer_email, customer_phone,
           shipping_address, city, state, pincode,
           subtotal, shipping_fee, tax, total_amount, payment_method, payment_status, order_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING')`,
        [
          orderNumber,
          invoiceNumber,
          trackingCode,
          customerName       || '',
          customerEmail      || '',
          customerPhone      || '',
          shippingAddress    || '',
          city               || '',
          state              || '',
          pincode            || '',
          calculatedSubtotal,
          calculatedShipping,
          calculatedTax,
          finalTotalAmount,
          paymentMethod      || 'RAZORPAY'
        ]
      );
      orderId = result.insertId;
    } catch (insertErr: any) {
      // Fallback: Retry without invoice_number if older DB schema
      logger.warn(`Primary order INSERT failed (${insertErr.message}). Retrying fallback insert.`);
      try {
        const [fallbackResult]: any = await pool.query(
          `INSERT INTO orders
            (order_number, customer_name, customer_email, customer_phone,
             shipping_address, city, state, pincode,
             subtotal, shipping_fee, tax, total_amount, payment_method, payment_status, order_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING')`,
          [
            orderNumber,
            customerName       || '',
            customerEmail      || '',
            customerPhone      || '',
            shippingAddress    || '',
            city               || '',
            state              || '',
            pincode            || '',
            calculatedSubtotal,
            calculatedShipping,
            calculatedTax,
            finalTotalAmount,
            paymentMethod      || 'RAZORPAY'
          ]
        );
        orderId = fallbackResult.insertId;
      } catch (fallbackErr: any) {
        logger.warn(`Fallback order INSERT also failed: ${fallbackErr.message}`);
      }
    }

    // 3. Stock Availability Pre-check & Validation
    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const targetId = item.id || item.product_id || 0;
        const targetName = item.title || item.name || '';
        const requestedQty = Number(item.quantity) || 1;

        try {
          const [prods]: any = await pool.query(
            `SELECT id, name, stock_quantity, in_stock FROM products WHERE id = ? OR name = ? LIMIT 1`,
            [targetId, targetName]
          );

          if (prods && prods.length > 0) {
            const product = prods[0];
            if (product.in_stock === 0 || product.stock_quantity <= 0) {
              return res.status(400).json({
                success: false,
                message: `Product "${product.name}" is currently out of stock.`
              });
            }
            if (product.stock_quantity < requestedQty) {
              return res.status(400).json({
                success: false,
                message: `Cannot place order: Product "${product.name}" only has ${product.stock_quantity} item(s) left in stock (you requested ${requestedQty}).`
              });
            }
          }
        } catch (checkErr: any) {
          logger.warn(`Stock pre-check warning: ${checkErr.message}`);
        }
      }
    }

    if (orderId) {
      logger.info(`Order created: ${orderNumber} | Tracking: ${trackingCode} (DB ID: ${orderId})`);

      if (items && Array.isArray(items)) {
        for (const item of items) {
          const targetId = item.id || item.product_id || 0;
          const targetName = item.title || item.name || '';
          const qty = Number(item.quantity) || 1;
          const unitPrice = Number(item.price) || 0;

          try {
            await pool.query(
              `INSERT INTO order_items (order_id, product_id, product_name, unit_price, metal_type, quantity, total_price)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [orderId, targetId || null, targetName, unitPrice, item.metalType || '18K Warm Gold', qty, unitPrice * qty]
            );

            // Deduct stock quantity and update in_stock flag in products table
            await pool.query(
              `UPDATE products 
               SET stock_quantity = GREATEST(0, stock_quantity - ?),
                   in_stock = IF((stock_quantity - ?) <= 0, 0, in_stock)
               WHERE id = ? OR name = ?`,
              [qty, qty, targetId, targetName]
            );
            logger.info(`[STOCK DEDUCT] Reduced stock by -${qty} for product "${targetName}" (Order #${orderNumber})`);
          } catch (itemErr: any) {
            logger.warn(`order_items INSERT/stock update failed for order ${orderNumber}: ${itemErr.message}`);
          }
        }
      }

      // ── Fire-and-forget: Send order confirmation email to admin ──────────────
      const savedItems = (items || []).map((item: any) => ({
        product_name: item.title || item.name || 'Product',
        unit_price:   Number(item.price) || 0,
        quantity:     Number(item.quantity) || 1,
        metal_type:   item.metalType || '18K Warm Gold',
        total_price:  (Number(item.price) || 0) * (Number(item.quantity) || 1)
      }));

      sendOrderConfirmationEmail({
        orderNumber,
        trackingCode: trackingCode || '',
        customerName:    customerName    || 'Valued Customer',
        customerEmail:   customerEmail   || '',
        customerPhone:   customerPhone   || '',
        shippingAddress: shippingAddress || '',
        city:            city            || '',
        state:           state           || '',
        pincode:         pincode         || '',
        items:           savedItems,
        subtotal:        calculatedSubtotal,
        shippingFee:     calculatedShipping,
        tax:             calculatedTax,
        totalAmount:     finalTotalAmount,
        paymentMethod:   paymentMethod   || 'RAZORPAY',
        paymentStatus:   'PENDING',
        orderStatus:     'PENDING',
        createdAt:       new Date().toISOString()
      }).catch(err => logger.warn(`[EMAIL] Order email failed silently: ${err.message}`));
      // ────────────────────────────────────────────────────────────────────────
    }

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully.',
      data: {
        orderNumber,
        invoiceNumber,
        trackingCode,
        subtotal: calculatedSubtotal,
        shippingFee: calculatedShipping,
        tax: calculatedTax,
        totalAmount: finalTotalAmount,
        customerName,
        customerEmail,
        orderStatus: 'PENDING',
        paymentStatus: 'PENDING'
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Track Order by Tracking Code
 * Public endpoint — returns full order details + items when a valid tracking code is supplied.
 *
 * GET /api/v1/orders/track/:trackingCode
 */
export const trackOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { trackingCode } = req.params;

    if (!trackingCode || !trackingCode.startsWith('TRK-')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tracking code format. Tracking codes start with TRK-.'
      });
    }

    try {
      const [rows]: any = await pool.query(
        `SELECT id, order_number, tracking_code, customer_name, customer_email,
                shipping_address, city, state, pincode,
                subtotal, shipping_fee, tax, total_amount,
                payment_method, payment_status, order_status,
                created_at, processing_at, shipped_at, delivered_at, cancelled_at, updated_at
         FROM orders WHERE tracking_code = ? LIMIT 1`,
        [trackingCode]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No order found for tracking code "${trackingCode}". Please check and try again.`
        });
      }

      const order = rows[0];

      // Fetch order items with product images and slugs
      const [items]: any = await pool.query(
        `SELECT oi.id, oi.product_id, oi.product_name, oi.unit_price, oi.metal_type, oi.quantity, oi.total_price,
                COALESCE(p.image, '') as product_image,
                COALESCE(p.slug, '') as product_slug
         FROM order_items oi
         LEFT JOIN products p ON (oi.product_id = p.id OR (oi.product_id IS NULL AND oi.product_name = p.name))
         WHERE oi.order_id = ?`,
        [order.id]
      );

      // Build a status timeline with exact recorded timestamps
      const statusSteps = [
        { status: 'PENDING', label: 'Order Placed', date: order.created_at },
        { status: 'PROCESSING', label: 'In Progress', date: order.processing_at },
        { status: 'SHIPPED', label: 'Shipped', date: order.shipped_at },
        { status: 'DELIVERED', label: 'Delivered', date: order.delivered_at }
      ];

      const currentIdx = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'].indexOf(order.order_status);
      const timeline = statusSteps.map((stepObj, idx) => ({
        status: stepObj.status,
        label: stepObj.label,
        date: stepObj.date || null,
        completed: idx <= currentIdx && order.order_status !== 'CANCELLED',
        active: stepObj.status === order.order_status && order.order_status !== 'CANCELLED'
      }));

      return res.status(200).json({
        success: true,
        data: {
          orderNumber:    order.order_number,
          trackingCode:   order.tracking_code,
          customerName:   order.customer_name,
          customerEmail:  order.customer_email,
          shippingAddress: `${order.shipping_address}, ${order.city}, ${order.state} - ${order.pincode}`,
          items:          items || [],
          pricing: {
            subtotal:    Number(order.subtotal),
            shippingFee: Number(order.shipping_fee),
            tax:         Number(order.tax),
            totalAmount: Number(order.total_amount)
          },
          paymentMethod:  order.payment_method,
          paymentStatus:  order.payment_status,
          orderStatus:    order.order_status,
          timeline,
          orderedAt:      order.created_at,
          processingAt:   order.processing_at,
          shippedAt:      order.shipped_at,
          deliveredAt:    order.delivered_at,
          cancelledAt:    order.cancelled_at,
          lastUpdated:    order.updated_at
        }
      });
    } catch (dbErr: any) {
      logger.error(`trackOrder DB error: ${dbErr.message}`);
      return res.status(500).json({ success: false, message: 'Failed to retrieve order tracking details.' });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Gets Order by Order Number (receipt / admin lookup)
 * GET /api/v1/orders/:orderNumber
 */
export const getOrderByNumber = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderNumber } = req.params;

    const [rows]: any = await pool.query(`SELECT * FROM orders WHERE order_number = ?`, [orderNumber]);
    if (rows && rows.length > 0) {
      const order = rows[0];
      const [items]: any = await pool.query(
        `SELECT oi.id, oi.product_id, oi.product_name, oi.unit_price, oi.metal_type, oi.quantity, oi.total_price,
                COALESCE(p.image, '') as product_image,
                COALESCE(p.slug, '') as product_slug
         FROM order_items oi
         LEFT JOIN products p ON (oi.product_id = p.id OR (oi.product_id IS NULL AND oi.product_name = p.name))
         WHERE oi.order_id = ?`,
        [order.id]
      );
      return res.status(200).json({ success: true, data: { ...order, items } });
    }

    return res.status(404).json({
      success: false,
      message: `Order #${orderNumber} not found.`
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Gets Order History for Logged In Customer
 * GET /api/v1/orders/my-orders
 */
export const getMyOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const email = req.query.email || (user ? user.email : null);
    const userId = user ? user.id : null;

    if (!email && !userId) {
      return res.status(200).json({ success: true, data: [] });
    }

    let query = `
      SELECT o.*
      FROM orders o
      WHERE 1=0
    `;
    const queryParams: any[] = [];

    if (userId) {
      query += ` OR o.user_id = ?`;
      queryParams.push(userId);
    }
    if (email) {
      query += ` OR LOWER(o.customer_email) = LOWER(?)`;
      queryParams.push(String(email).trim());
    }

    query += ` ORDER BY o.id DESC`;

    const [orders]: any = await pool.query(query, queryParams);

    const ordersWithItems = await Promise.all(
      (orders || []).map(async (order: any) => {
        const [items]: any = await pool.query(
          `SELECT oi.id, oi.product_id, oi.product_name, oi.unit_price, oi.metal_type, oi.quantity, oi.total_price,
                  COALESCE(p.image, '') as product_image,
                  COALESCE(p.slug, '') as product_slug
           FROM order_items oi
           LEFT JOIN products p ON (oi.product_id = p.id OR (oi.product_id IS NULL AND oi.product_name = p.name))
           WHERE oi.order_id = ?`,
          [order.id]
        );

        const statusSteps = [
          { status: 'PENDING', label: 'Order Placed', date: order.created_at },
          { status: 'PROCESSING', label: 'In Progress', date: order.processing_at },
          { status: 'SHIPPED', label: 'Shipped', date: order.shipped_at },
          { status: 'DELIVERED', label: 'Delivered', date: order.delivered_at }
        ];

        const currentIdx = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'].indexOf(order.order_status);
        const timeline = statusSteps.map((stepObj, idx) => ({
          status: stepObj.status,
          label: stepObj.label,
          date: stepObj.date || null,
          completed: idx <= currentIdx && order.order_status !== 'CANCELLED',
          active: stepObj.status === order.order_status && order.order_status !== 'CANCELLED'
        }));

        return {
          ...order,
          items: items || [],
          timeline
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: ordersWithItems
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Downloads official A4 Tax Invoice PDF
 * GET /api/v1/orders/:orderNumber/invoice-pdf
 */
export const downloadInvoicePdf = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderNumber } = req.params;

    if (!orderNumber) {
      return res.status(400).json({ success: false, message: 'Order number is required.' });
    }

    const [rows]: any = await pool.query(
      `SELECT * FROM orders WHERE order_number = ? OR invoice_number = ? OR id = ? LIMIT 1`,
      [orderNumber, orderNumber, isNaN(Number(orderNumber)) ? 0 : Number(orderNumber)]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Order #${orderNumber} not found.`
      });
    }

    const order = rows[0];

    const [items]: any = await pool.query(
      `SELECT oi.id, oi.product_id, oi.product_name, oi.unit_price, oi.metal_type, oi.quantity, oi.total_price
       FROM order_items oi
       WHERE oi.order_id = ?`,
      [order.id]
    );

    const storeSettings = await getStoreSettings();

    const invoiceNum = order.invoice_number ||
      `${storeSettings.invoicePrefix || 'INV-'}${new Date(order.created_at || Date.now()).getFullYear()}-${String(order.order_number).replace(/\D/g, '').padStart(6, '0')}`;

    // Ensure order in DB has invoice_number if it was previously null
    if (!order.invoice_number) {
      try {
        await pool.query(`UPDATE orders SET invoice_number = ? WHERE id = ?`, [invoiceNum, order.id]);
        order.invoice_number = invoiceNum;
      } catch (e) { }
    }

    const filename = `Invoice-${invoiceNum}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    await generateInvoicePdf(
      {
        order_number: order.order_number,
        invoice_number: invoiceNum,
        created_at: order.created_at,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_phone: order.customer_phone,
        shipping_address: order.shipping_address,
        city: order.city,
        state: order.state,
        pincode: order.pincode,
        subtotal: Number(order.subtotal) || 0,
        shipping_fee: Number(order.shipping_fee) || 0,
        tax: Number(order.tax) || 0,
        total_amount: Number(order.total_amount) || 0,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        tracking_code: order.tracking_code,
        items: (items || []).map((it: any) => ({
          product_name: it.product_name,
          metal_type: it.metal_type,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          total_price: Number(it.total_price) || (Number(it.unit_price) * Number(it.quantity)),
          hsn_code: '7117'
        }))
      },
      storeSettings,
      res
    );
  } catch (err) {
    next(err);
  }
};

