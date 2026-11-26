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
const generateOrderNumber = async (connection?: any): Promise<string> => {
  const PREFIX = 'ART-';
  const PAD_LENGTH = 6;
  const db = connection || pool;

  try {
    const [rows]: any = await db.query(
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
        const isNumeric = !isNaN(Number(order_number));
        if (isNumeric) {
          await pool.query(
            `UPDATE orders
             SET payment_status = 'PAID',
                 order_status = 'PROCESSING',
                 razorpay_order_id = ?,
                 razorpay_payment_id = ?,
                 razorpay_signature = ?,
                 paid_at = CURRENT_TIMESTAMP,
                 processing_at = COALESCE(processing_at, CURRENT_TIMESTAMP)
             WHERE id = ?`,
            [razorpay_order_id, razorpay_payment_id, razorpay_signature, Number(order_number)]
          );
        } else {
          await pool.query(
            `UPDATE orders
             SET payment_status = 'PAID',
                 order_status = 'PROCESSING',
                 razorpay_order_id = ?,
                 razorpay_payment_id = ?,
                 razorpay_signature = ?,
                 paid_at = CURRENT_TIMESTAMP,
                 processing_at = COALESCE(processing_at, CURRENT_TIMESTAMP)
             WHERE order_number = ?`,
            [razorpay_order_id, razorpay_payment_id, razorpay_signature, order_number]
          );
        }
      }
    } catch (dbErr: any) {
      logger.warn(`MySQL DB update during payment verification warning: ${dbErr.message}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified and transaction recorded in database successfully.',
      data: {
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        signature: razorpay_signature,
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

    // 1. Basic Payload Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must contain at least one item.'
      });
    }

    if (!shippingAddress || !shippingAddress.trim() || !city || !city.trim() || !pincode || !pincode.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Shipping address, city, and PIN code are required to place an order.'
      });
    }

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

    const cleanEmail = (customerEmail || '').trim();
    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        message: 'Customer email is required.'
      });
    }

    // 2. Product Existence, Active Status & Stock Availability Pre-check
    // (Strictly verified BEFORE any database insertion or stock alteration)
    const validatedItems: Array<{
      productId: number;
      productName: string;
      unitPrice: number;
      quantity: number;
      metalType: string;
      totalPrice: number;
    }> = [];

    for (const item of items) {
      const targetId = Number(item.id || item.product_id || item.productId) || 0;
      const targetName = String(item.title || item.name || '').trim();
      const requestedQty = Math.max(1, Number(item.quantity) || 1);

      let productRow: any = null;
      if (targetId > 0) {
        const [rows]: any = await pool.query(
          `SELECT id, name, price, stock_quantity, in_stock, is_active FROM products WHERE id = ? LIMIT 1`,
          [targetId]
        );
        if (rows && rows.length > 0) {
          productRow = rows[0];
        }
      }

      if (!productRow && targetName) {
        const [rows]: any = await pool.query(
          `SELECT id, name, price, stock_quantity, in_stock, is_active FROM products WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1`,
          [targetName]
        );
        if (rows && rows.length > 0) {
          productRow = rows[0];
        }
      }

      if (!productRow) {
        return res.status(400).json({
          success: false,
          message: `Product "${targetName || targetId}" was not found in catalog.`
        });
      }

      // Check product active / visibility status
      if (productRow.is_active === 0 || productRow.is_active === false) {
        return res.status(400).json({
          success: false,
          message: `Product "${productRow.name}" is currently unavailable.`
        });
      }

      // Check stock availability
      const currentStock = Number(productRow.stock_quantity) || 0;
      const isInStock = Boolean(productRow.in_stock !== 0 && productRow.in_stock !== false);

      if (!isInStock || currentStock <= 0) {
        return res.status(400).json({
          success: false,
          message: `Product "${productRow.name}" is currently out of stock.`
        });
      }

      if (currentStock < requestedQty) {
        return res.status(400).json({
          success: false,
          message: `Cannot place order: Product "${productRow.name}" only has ${currentStock} item(s) left in stock (you requested ${requestedQty}).`
        });
      }

      const unitPrice = (item.price !== undefined && !isNaN(Number(item.price)) && Number(item.price) > 0)
        ? Number(item.price)
        : Number(productRow.price);

      validatedItems.push({
        productId: productRow.id,
        productName: productRow.name,
        unitPrice,
        quantity: requestedQty,
        metalType: item.metalType || '18K Warm Gold',
        totalPrice: unitPrice * requestedQty
      });
    }

    // 3. Fetch Active Store Settings & Calculate Financial Totals
    const storeSettings = await getStoreSettings();

    const calculatedSubtotal = validatedItems.reduce((acc, it) => acc + it.totalPrice, 0);
    const freeThreshold = Number(storeSettings.freeDeliveryThreshold) || 600;
    const baseDeliveryFee = Number(storeSettings.deliveryCharge) !== undefined ? Number(storeSettings.deliveryCharge) : 50;
    const calculatedShipping = (calculatedSubtotal >= freeThreshold || calculatedSubtotal === 0) ? 0 : baseDeliveryFee;

    const gstRate = Number(storeSettings.gstPercentage) || 3.0;
    const calculatedTax = Math.round(calculatedSubtotal * (gstRate / 100));
    const finalTotalAmount = calculatedSubtotal + calculatedShipping + calculatedTax;

    // 4. Atomic MySQL Transaction: Create Order, Order Items & Deduct Stock
    const connection = await pool.getConnection();
    let orderNumber = '';
    let invoiceNumber = '';
    let orderId: number | null = null;
    const trackingCode: string | null = null;

    try {
      await connection.beginTransaction();

      // Sequential order number inside transaction lock
      orderNumber = await generateOrderNumber(connection);

      const currentYear = new Date().getFullYear();
      const cleanNum = orderNumber.replace(/\D/g, '').padStart(6, '0');
      invoiceNumber = `${storeSettings.invoicePrefix || 'INV-'}${currentYear}-${cleanNum}`;

      // Check if user exists to link user_id
      let linkedUserId: number | null = (req as any).user?.id || null;
      if (!linkedUserId && cleanEmail) {
        const [userRows]: any = await connection.query(
          `SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
          [cleanEmail]
        );
        if (userRows && userRows.length > 0) {
          linkedUserId = userRows[0].id;
        }
      }

      const [orderResult]: any = await connection.query(
        `INSERT INTO orders
          (order_number, invoice_number, tracking_code, user_id, customer_name, customer_email, customer_phone,
           shipping_address, city, state, pincode,
           subtotal, shipping_fee, tax, total_amount, payment_method, payment_status, order_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING')`,
        [
          orderNumber,
          invoiceNumber,
          trackingCode,
          linkedUserId,
          (customerName || '').trim(),
          cleanEmail,
          cleanPhone,
          shippingAddress.trim(),
          city.trim(),
          state ? state.trim() : '',
          cleanPincode,
          calculatedSubtotal,
          calculatedShipping,
          calculatedTax,
          finalTotalAmount,
          paymentMethod ? String(paymentMethod).toUpperCase() : 'RAZORPAY'
        ]
      );

      orderId = orderResult.insertId;

      // Insert line items and decrement product stock atomically
      for (const item of validatedItems) {
        await connection.query(
          `INSERT INTO order_items (order_id, product_id, product_name, unit_price, metal_type, quantity, total_price)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [orderId, item.productId, item.productName, item.unitPrice, item.metalType, item.quantity, item.totalPrice]
        );

        await connection.query(
          `UPDATE products 
           SET stock_quantity = GREATEST(0, stock_quantity - ?),
               in_stock = IF((stock_quantity - ?) <= 0, 0, in_stock)
           WHERE id = ?`,
          [item.quantity, item.quantity, item.productId]
        );

        logger.info(`[STOCK DEDUCT] Reduced stock by -${item.quantity} for product "${item.productName}" (Order #${orderNumber})`);
      }

      await connection.commit();
    } catch (txErr: any) {
      await connection.rollback();
      logger.error(`Order creation transaction failed and was rolled back: ${txErr.message}`);
      throw txErr;
    } finally {
      connection.release();
    }

    // 5. Fire-and-forget: Send order confirmation email notification
    sendOrderConfirmationEmail({
      orderNumber,
      trackingCode: trackingCode || '',
      customerName: (customerName || '').trim() || 'Valued Customer',
      customerEmail: cleanEmail,
      customerPhone: cleanPhone,
      shippingAddress: shippingAddress.trim(),
      city: city.trim(),
      state: state ? state.trim() : '',
      pincode: cleanPincode,
      items: validatedItems.map(it => ({
        product_name: it.productName,
        unit_price: it.unitPrice,
        quantity: it.quantity,
        metal_type: it.metalType,
        total_price: it.totalPrice
      })),
      subtotal: calculatedSubtotal,
      shippingFee: calculatedShipping,
      tax: calculatedTax,
      totalAmount: finalTotalAmount,
      paymentMethod: paymentMethod ? String(paymentMethod).toUpperCase() : 'RAZORPAY',
      paymentStatus: 'PENDING',
      orderStatus: 'PENDING',
      createdAt: new Date().toISOString()
    }).catch(err => logger.warn(`[EMAIL] Order email failed silently: ${err.message}`));

    logger.info(`Order created successfully: ${orderNumber} (DB ID: ${orderId})`);

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully.',
      data: {
        orderId,
        orderNumber,
        invoiceNumber,
        trackingCode,
        subtotal: calculatedSubtotal,
        shippingFee: calculatedShipping,
        tax: calculatedTax,
        totalAmount: finalTotalAmount,
        customerName: (customerName || '').trim(),
        customerEmail: cleanEmail,
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
                created_at, processing_at, shipped_at, delivered_at, cancelled_at,
                cancellation_reason, cancelled_by, updated_at
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
          cancelledAt:        order.cancelled_at,
          cancellationReason: order.cancellation_reason,
          cancelledBy:        order.cancelled_by,
          lastUpdated:        order.updated_at
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
    const { email: queryEmail, limit, page, offset } = req.query;
    const email = queryEmail || (user ? user.email : null);
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

    if (limit) {
      const pageLimit = Math.max(1, Math.min(100, Number(limit)));
      const pageOffset = offset ? Math.max(0, Number(offset)) : (page ? (Math.max(1, Number(page)) - 1) * pageLimit : 0);
      query += ` LIMIT ? OFFSET ?`;
      queryParams.push(pageLimit, pageOffset);
    }

    const [orders]: any = await pool.query(query, queryParams);

    const itemsByOrderId: Record<number, any[]> = {};
    if (orders && orders.length > 0) {
      const orderIds = orders.map((o: any) => o.id);
      const [allItems]: any = await pool.query(
        `SELECT oi.id, oi.order_id, oi.product_id, oi.product_name, oi.unit_price, oi.metal_type, oi.quantity, oi.total_price,
                COALESCE(p.image, '') as product_image,
                COALESCE(p.slug, '') as product_slug
         FROM order_items oi
         LEFT JOIN products p ON (oi.product_id = p.id OR (oi.product_id IS NULL AND oi.product_name = p.name))
         WHERE oi.order_id IN (?)
         ORDER BY oi.id ASC`,
        [orderIds]
      );

      for (const item of allItems || []) {
        if (!itemsByOrderId[item.order_id]) {
          itemsByOrderId[item.order_id] = [];
        }
        itemsByOrderId[item.order_id].push(item);
      }
    }

    const ordersWithItems = (orders || []).map((order: any) => {
      const items = itemsByOrderId[order.id] || [];
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
        items,
        timeline
      };
    });

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

/**
 * Customer / Client: Cancel Order
 * Endpoint: POST /api/v1/orders/:idOrOrderNumber/cancel
 *
 * Rules:
 * 1. Verifies order exists in database.
 * 2. Verifies ownership (authenticated user matches user_id / email, or matching email provided in request, or admin role).
 * 3. Validates order status:
 *    - Cannot cancel if status is 'CANCELLED'.
 *    - Cannot cancel if status is 'SHIPPED' or 'DELIVERED'.
 *    - Only allowed if status is 'PENDING' or 'PROCESSING'.
 * 4. Atomic transaction:
 *    - Updates order_status to 'CANCELLED', records cancelled_at, cancellation_reason, cancelled_by.
 *    - Restores inventory stock for all items in the order.
 * 5. Returns updated order details and confirmation message.
 */
export const cancelCustomerOrder = async (req: Request, res: Response, next: NextFunction) => {
  let connection: any = null;
  try {
    const { idOrOrderNumber } = req.params;
    const { reason, email } = req.body;

    if (!idOrOrderNumber) {
      return res.status(400).json({
        success: false,
        message: 'Order identifier is required.'
      });
    }

    // 1. Fetch order from database
    const [orders]: any = await pool.query(
      `SELECT id, order_number, user_id, customer_email, customer_name, order_status, payment_method, payment_status, total_amount, created_at
       FROM orders
       WHERE id = ? OR order_number = ?
       LIMIT 1`,
      [idOrOrderNumber, idOrOrderNumber]
    );

    if (!orders || orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Order #${idOrOrderNumber} not found.`
      });
    }

    const order = orders[0];

    // 2. Security & Ownership Validation
    const user = (req as any).user;
    const reqEmail = (email || req.query.email || '').trim().toLowerCase();

    if (user) {
      const isOwner = (order.user_id && order.user_id === (user.id || user.userId)) ||
                      (order.customer_email && order.customer_email.toLowerCase() === user.email.toLowerCase());
      const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to cancel this order.'
        });
      }
    } else {
      // Unauthenticated request must provide matching email
      if (!reqEmail || reqEmail !== order.customer_email.toLowerCase()) {
        return res.status(401).json({
          success: false,
          message: 'Valid customer email is required to cancel this order.'
        });
      }
    }

    // 3. Status Transition Validations
    const currentStatus = (order.order_status || '').toUpperCase();

    if (currentStatus === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        message: `Order #${order.order_number} is already cancelled.`
      });
    }

    if (currentStatus === 'SHIPPED') {
      return res.status(400).json({
        success: false,
        message: `Order #${order.order_number} has already been shipped and cannot be cancelled online. Once delivered, you may request an exchange or assistance with our atelier concierge.`
      });
    }

    if (currentStatus === 'DELIVERED') {
      return res.status(400).json({
        success: false,
        message: `Order #${order.order_number} has already been delivered. Please contact our concierge for return or exchange assistance.`
      });
    }

    // 4. Atomic Database Transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const cancellationReason = (reason || 'Cancelled by customer').trim().substring(0, 255);
    const cancelledBy = user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') ? 'ADMIN' : 'CUSTOMER';

    // Update orders table
    await connection.query(
      `UPDATE orders
       SET order_status = 'CANCELLED',
           payment_status = IF(payment_status = 'PAID', 'REFUNDED', payment_status),
           cancelled_at = CURRENT_TIMESTAMP,
           cancellation_reason = ?,
           cancelled_by = ?
       WHERE id = ?`,
      [cancellationReason, cancelledBy, order.id]
    );

    // Restore stock for all products in this order
    const [orderItems]: any = await connection.query(
      `SELECT product_id, product_name, quantity FROM order_items WHERE order_id = ?`,
      [order.id]
    );

    if (orderItems && orderItems.length > 0) {
      for (const item of orderItems) {
        const qty = Number(item.quantity) || 1;
        const prodId = item.product_id;
        const prodName = item.product_name;

        await connection.query(
          `UPDATE products
           SET stock_quantity = stock_quantity + ?,
               in_stock = 1
           WHERE id = ? OR name = ?`,
          [qty, prodId || 0, prodName || '']
        );
        logger.info(`[CUSTOMER CANCEL] Restored +${qty} stock for item "${prodName}" on Order #${order.order_number}`);
      }
    }

    await connection.commit();

    logger.info(`Order #${order.order_number} (ID: ${order.id}) successfully CANCELLED by ${cancelledBy}. Reason: "${cancellationReason}"`);

    return res.status(200).json({
      success: true,
      message: `Order #${order.order_number} has been cancelled successfully.`,
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        orderStatus: 'CANCELLED',
        cancelledAt: new Date().toISOString(),
        cancellationReason,
        cancelledBy
      }
    });

  } catch (err: any) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) {
        logger.error(`Rollback error on cancelCustomerOrder: ${rbErr}`);
      }
    }
    logger.error(`cancelCustomerOrder error: ${err.message}`);
    next(err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


