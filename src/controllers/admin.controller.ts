import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { sendOrderCancelledEmail } from '../services/emailService';

const JWT_SECRET = process.env.JWT_SECRET || 'AristaTrinketsJwtSecretKey2026';

/**
 * Gets Admin Dashboard Summary Statistics
 */
export const getAdminMetrics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [productCount]: any = await pool.query(`SELECT COUNT(*) as total FROM products`);
    const [orderCount]: any = await pool.query(`SELECT COUNT(*) as total FROM orders`);
    const [revenueSum]: any = await pool.query(`SELECT SUM(total_amount) as total FROM orders WHERE payment_status = 'PAID'`);
    const [lowStockCount]: any = await pool.query(`SELECT COUNT(*) as total FROM products WHERE stock_quantity <= 5`);

    return res.status(200).json({
      success: true,
      data: {
        totalProducts: Number(productCount[0]?.total || 0),
        totalOrders: Number(orderCount[0]?.total || 0),
        totalRevenue: Number(revenueSum[0]?.total || 0),
        lowStockItems: Number(lowStockCount[0]?.total || 0)
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Create Product
 */
export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  let connection: any = null;
  try {
    const { name, category, categoryId, price, compareAtPrice, badge, metalType, gemstone, inStock, stockQuantity, description, materials, careGuide, shippingInfo, image, specifications, images } = req.body;

    if (!name || !price || !image) {
      return res.status(400).json({ success: false, message: 'Product name, price, and primary image are required.' });
    }

    if (compareAtPrice !== undefined && compareAtPrice !== null && compareAtPrice !== '' && Number(price) > Number(compareAtPrice)) {
      return res.status(400).json({ success: false, message: 'Product Price (₹ INR) cannot be greater than Compare-At Price (₹ INR).' });
    }

    let slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    if (!slug) {
      slug = `product-${Date.now()}`;
    }

    connection = await pool.getConnection();

    // Check slug collision and ensure uniqueness
    let candidateSlug = slug;
    let suffix = 1;
    while (true) {
      const [existing]: any = await connection.query(`SELECT id FROM products WHERE slug = ?`, [candidateSlug]);
      if (!existing || existing.length === 0) {
        slug = candidateSlug;
        break;
      }
      suffix++;
      candidateSlug = `${slug}-${suffix}`;
    }

    let finalCategoryId = categoryId || null;
    if (!finalCategoryId && category) {
      try {
        const [cats]: any = await connection.query(
          `SELECT id FROM categories WHERE LOWER(name) = LOWER(?) OR LOWER(slug) = LOWER(?)`,
          [category, category]
        );
        if (cats && cats.length > 0) {
          finalCategoryId = cats[0].id;
        }
      } catch (err) { }
    }

    const parsedStockNew = (stockQuantity !== undefined && stockQuantity !== null && String(stockQuantity).trim() !== '' && !isNaN(Number(stockQuantity)))
      ? Math.max(0, Number(stockQuantity))
      : 10;
    const calculatedInStockNew = parsedStockNew > 0 ? (inStock !== false ? 1 : 0) : 0;
    const isActiveValNew = (req.body.isActive !== undefined) ? (req.body.isActive ? 1 : 0) : ((req.body.available !== undefined) ? (req.body.available ? 1 : 0) : 1);

    await connection.beginTransaction();

    const [result]: any = await connection.query(
      `INSERT INTO products (name, slug, category_id, price, compare_at_price, badge, metal_type, gemstone, in_stock, stock_quantity, is_active, description, materials, care_guide, shipping_info, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, slug, finalCategoryId, price, compareAtPrice || null, badge || null, metalType || '18K Warm Gold', gemstone || null, calculatedInStockNew, parsedStockNew, isActiveValNew, description || '', typeof materials === 'string' ? materials : JSON.stringify(materials || []), careGuide || '', shippingInfo || '', image]
    );

    const productId = result.insertId;

    if (specifications && Array.isArray(specifications)) {
      for (const spec of specifications) {
        if (spec && spec.label && String(spec.label).trim() !== '' && spec.value && String(spec.value).trim() !== '') {
          await connection.query(
            `INSERT INTO product_specifications (product_id, spec_label, spec_value) VALUES (?, ?, ?)`,
            [productId, String(spec.label).trim(), String(spec.value).trim()]
          );
        }
      }
    }

    const imageListToInsert: string[] = [];
    if (images && Array.isArray(images) && images.length > 0) {
      for (const imgUrl of images) {
        if (imgUrl && typeof imgUrl === 'string' && imgUrl.trim() !== '') {
          imageListToInsert.push(imgUrl.trim());
        }
      }
    }
    if (image && !imageListToInsert.includes(image)) {
      imageListToInsert.unshift(image);
    }

    for (let i = 0; i < imageListToInsert.length; i++) {
      await connection.query(
        `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)`,
        [productId, imageListToInsert[i], i]
      );
    }

    if (finalCategoryId) {
      await connection.query(
        `UPDATE categories SET item_count = (SELECT COUNT(*) FROM products WHERE category_id = ? AND (is_active = 1 OR is_active IS NULL)) WHERE id = ?`,
        [finalCategoryId, finalCategoryId]
      );
    }

    await connection.commit();

    logger.info(`Admin created new product: ${name} (ID: ${productId}, Slug: ${slug})`);
    return res.status(201).json({ success: true, message: 'Product created successfully.', data: { id: productId, name, slug } });
  } catch (err: any) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rbErr) { }
    }
    logger.error(`MySQL transaction failed for product creation: ${err.message}`);
    next(err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * Admin: Update Product
 */
export const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const {
      name,
      category,
      price,
      compareAtPrice,
      badge,
      inStock,
      stockQuantity,
      isActive,
      available,
      description,
      materials,
      materialsStr,
      careGuide,
      shippingInfo,
      specifications,
      image,
      images
    } = req.body;

    if (price !== undefined && compareAtPrice !== undefined && compareAtPrice !== null && compareAtPrice !== '' && Number(price) > Number(compareAtPrice)) {
      return res.status(400).json({ success: false, message: 'Product Price (₹ INR) cannot be greater than Compare-At Price (₹ INR).' });
    }

    try {
      let categoryId = null;
      if (category) {
        const [cats]: any = await pool.query(
          `SELECT id FROM categories WHERE LOWER(name) = LOWER(?) OR LOWER(slug) = LOWER(?)`,
          [category, category]
        );
        if (cats && cats.length > 0) {
          categoryId = cats[0].id;
        }
      }

      let formattedMaterials = materials;
      if (!formattedMaterials && materialsStr && typeof materialsStr === 'string') {
        formattedMaterials = materialsStr.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      const materialsValue = typeof formattedMaterials === 'string'
        ? formattedMaterials
        : JSON.stringify(formattedMaterials || []);

      const parsedStock = (stockQuantity !== undefined && stockQuantity !== null && String(stockQuantity).trim() !== '' && !isNaN(Number(stockQuantity)))
        ? Math.max(0, Number(stockQuantity))
        : null;

      const calculatedInStock = parsedStock !== null
        ? (parsedStock > 0 ? 1 : 0)
        : (inStock !== false ? 1 : 0);

      const isActiveVal = (isActive !== undefined)
        ? (isActive ? 1 : 0)
        : ((available !== undefined) ? (available ? 1 : 0) : null);

      await pool.query(
        `UPDATE products SET 
          name = COALESCE(?, name), 
          category_id = COALESCE(?, category_id), 
          price = COALESCE(?, price), 
          compare_at_price = ?, 
          badge = ?, 
          in_stock = ?, 
          stock_quantity = COALESCE(?, stock_quantity), 
          is_active = COALESCE(?, is_active),
          description = COALESCE(?, description), 
          materials = ?,
          care_guide = ?,
          shipping_info = ?,
          image = COALESCE(?, image),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name,
          categoryId,
          price,
          compareAtPrice || null,
          badge || null,
          calculatedInStock,
          parsedStock,
          isActiveVal,
          description || '',
          materialsValue,
          careGuide || '',
          shippingInfo || '',
          image,
          id
        ]
      );

      if (specifications && Array.isArray(specifications)) {
        await pool.query(`DELETE FROM product_specifications WHERE product_id = ?`, [id]);
        for (const spec of specifications) {
          if (spec.label && spec.value) {
            await pool.query(
              `INSERT INTO product_specifications (product_id, spec_label, spec_value) VALUES (?, ?, ?)`,
              [id, spec.label, spec.value]
            );
          }
        }
      }

      if (images && Array.isArray(images)) {
        await pool.query(`DELETE FROM product_images WHERE product_id = ?`, [id]);
        for (let i = 0; i < images.length; i++) {
          await pool.query(
            `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)`,
            [id, images[i], i]
          );
        }
      }
    } catch (dbErr: any) {
      logger.error(`Product update DB error: ${dbErr.message}`);
      return res.status(500).json({ success: false, message: dbErr.message });
    }

    return res.status(200).json({ success: true, message: `Product ID ${id} updated successfully.` });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Delete Product
 */
export const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    try {
      await pool.query(`DELETE FROM products WHERE id = ?`, [id]);
    } catch (dbErr: any) {
      logger.error(`Product delete DB error: ${dbErr.message}`);
      return res.status(500).json({ success: false, message: dbErr.message });
    }

    return res.status(200).json({ success: true, message: `Product ID ${id} deleted successfully.` });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Create Category
 */
export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, description, image } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }

    const trimmedName = name.trim();
    const cleanSlug = (slug || trimmedName).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    // Case-insensitive duplicate check for category name or slug
    const [existing]: any = await pool.query(
      `SELECT id, name FROM categories WHERE LOWER(TRIM(name)) = LOWER(?) OR LOWER(slug) = LOWER(?)`,
      [trimmedName, cleanSlug]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Category "${trimmedName}" already exists.`
      });
    }

    try {
      const [result]: any = await pool.query(
        `INSERT INTO categories (name, slug, description, image, item_count) VALUES (?, ?, ?, ?, 0)`,
        [trimmedName, cleanSlug, description || '', image || '/assets/images/hero-categories.webp']
      );
      logger.info(`Category created in database: ${trimmedName} (ID: ${result.insertId})`);
      return res.status(201).json({
        success: true,
        message: 'Category created successfully.',
        data: { id: result.insertId, name: trimmedName, slug: cleanSlug, image }
      });
    } catch (dbErr: any) {
      logger.error(`Category creation DB error: ${dbErr.message}`);
      return res.status(500).json({ success: false, message: dbErr.message });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Update Category
 */
export const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, slug, description, image } = req.body;

    if (name || slug) {
      const checkName = name ? name.trim() : '';
      const checkSlug = slug ? slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-') : '';

      const [existing]: any = await pool.query(
        `SELECT id FROM categories WHERE (LOWER(TRIM(name)) = LOWER(?) OR LOWER(slug) = LOWER(?)) AND id != ? AND slug != ?`,
        [checkName, checkSlug, id, id]
      );
      if (existing && existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Category "${checkName || checkSlug}" already exists.`
        });
      }
    }

    try {
      const cleanSlug = slug ? slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-') : undefined;
      await pool.query(
        `UPDATE categories SET 
          name = COALESCE(?, name), 
          slug = COALESCE(?, slug), 
          description = COALESCE(?, description), 
          image = COALESCE(?, image),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? OR slug = ?`,
        [name ? name.trim() : null, cleanSlug, description, image, id, id]
      );
    } catch (dbErr: any) {
      logger.error(`Category update DB error: ${dbErr.message}`);
      return res.status(500).json({ success: false, message: dbErr.message });
    }
    return res.status(200).json({ success: true, message: `Category updated successfully.` });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Delete Category
 */
export const deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 1. Fetch category
    const [catRows]: any = await pool.query(
      `SELECT id, name, slug FROM categories WHERE id = ? OR slug = ?`,
      [id, id]
    );

    if (!catRows || catRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    const cat = catRows[0];

    // 2. Check if products are associated with this category
    const [prodRows]: any = await pool.query(
      `SELECT COUNT(*) as count FROM products WHERE category_id = ?`,
      [cat.id]
    );

    const count = prodRows && prodRows[0] ? Number(prodRows[0].count) : 0;

    if (count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category "${cat.name}": ${count} product(s) are assigned to this category. Please reassign or delete the products first.`
      });
    }

    try {
      await pool.query(`DELETE FROM categories WHERE id = ?`, [cat.id]);
    } catch (dbErr: any) {
      logger.error(`Category delete DB error: ${dbErr.message}`);
      return res.status(500).json({ success: false, message: dbErr.message });
    }

    return res.status(200).json({ success: true, message: `Category "${cat.name}" deleted successfully.` });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Update Order Status
 */
export const updateOrderStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status, orderStatus, paymentStatus } = req.body;

    const newOrderStatus = (status || orderStatus || '').toUpperCase();
    const validStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

    if (!validStatuses.includes(newOrderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid order status "${newOrderStatus}". Allowed: ${validStatuses.join(', ')}`
      });
    }

    // 1. Fetch current order status from DB before updating
    const [existingOrders]: any = await pool.query(
      `SELECT id, order_number, tracking_code, customer_name, customer_email, customer_phone, shipping_address, city, state, pincode, total_amount, payment_method, payment_status, order_status FROM orders WHERE id = ? OR order_number = ? LIMIT 1`,
      [id, id]
    );

    if (!existingOrders || existingOrders.length === 0) {
      return res.status(404).json({ success: false, message: `Order #${id} not found in database.` });
    }

    const currentOrderStatus = existingOrders[0].order_status;
    const currentPaymentStatus = existingOrders[0].payment_status;
    const paymentMethod = (existingOrders[0].payment_method || '').toUpperCase();
    const dbOrderId = existingOrders[0].id;

    // 2. Handle Stock Restoration on Order Cancellation & Send Cancellation Email
    if (newOrderStatus === 'CANCELLED' && currentOrderStatus !== 'CANCELLED') {
      try {
        const [orderItems]: any = await pool.query(
          `SELECT product_id, product_name, quantity, unit_price, metal_type, total_price FROM order_items WHERE order_id = ?`,
          [dbOrderId]
        );

        if (orderItems && orderItems.length > 0) {
          for (const item of orderItems) {
            const qty = Number(item.quantity) || 1;
            const prodId = item.product_id;
            const prodName = item.product_name;

            await pool.query(
              `UPDATE products 
               SET stock_quantity = stock_quantity + ?, in_stock = 1 
               WHERE id = ? OR name = ?`,
              [qty, prodId || 0, prodName || '']
            );
            logger.info(`[STOCK RESTORE] Restored +${qty} stock for item "${prodName}" on cancellation of Order #${id}`);
          }
        }

        // Send order cancellation email to ADMIN_EMAIL
        sendOrderCancelledEmail({
          orderNumber: existingOrders[0].order_number || String(id),
          trackingCode: existingOrders[0].tracking_code || '',
          customerName: existingOrders[0].customer_name || '',
          customerEmail: existingOrders[0].customer_email || '',
          customerPhone: existingOrders[0].customer_phone || '',
          shippingAddress: existingOrders[0].shipping_address || '',
          city: existingOrders[0].city || '',
          state: existingOrders[0].state || '',
          pincode: existingOrders[0].pincode || '',
          totalAmount: Number(existingOrders[0].total_amount || 0),
          paymentMethod: existingOrders[0].payment_method,
          paymentStatus: existingOrders[0].payment_status,
          items: (orderItems || []).map((it: any) => ({
            product_name: it.product_name,
            unit_price: Number(it.unit_price || 0),
            quantity: Number(it.quantity || 1),
            metal_type: it.metal_type || '',
            total_price: Number(it.total_price || 0)
          })),
          cancelledAt: new Date().toISOString()
        }).catch(err => logger.warn(`[EMAIL] Cancellation email notification failed: ${err.message}`));

      } catch (stockErr: any) {
        logger.warn(`Stock restoration error on order cancellation: ${stockErr.message}`);
      }
    }

    // 3. Handle Stock Re-deduction if order is changed FROM CANCELLED back to active status
    if (currentOrderStatus === 'CANCELLED' && newOrderStatus !== 'CANCELLED') {
      try {
        const [orderItems]: any = await pool.query(
          `SELECT product_id, product_name, quantity FROM order_items WHERE order_id = ?`,
          [dbOrderId]
        );

        if (orderItems && orderItems.length > 0) {
          for (const item of orderItems) {
            const qty = Number(item.quantity) || 1;
            const prodId = item.product_id;
            const prodName = item.product_name;

            await pool.query(
              `UPDATE products 
               SET stock_quantity = GREATEST(0, stock_quantity - ?),
                   in_stock = IF((stock_quantity - ?) <= 0, 0, 1)
               WHERE id = ? OR name = ?`,
              [qty, qty, prodId || 0, prodName || '']
            );
            logger.info(`[STOCK RE-DEDUCT] Re-deducted -${qty} stock for item "${prodName}" on reactivating Order #${id}`);
          }
        }
      } catch (stockErr: any) {
        logger.warn(`Stock re-deduction error on order un-cancellation: ${stockErr.message}`);
      }
    }

    let dateColumnUpdate = '';
    if (newOrderStatus === 'PROCESSING') {
      dateColumnUpdate = `, processing_at = COALESCE(processing_at, CURRENT_TIMESTAMP)`;
    } else if (newOrderStatus === 'SHIPPED') {
      dateColumnUpdate = `, shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP)`;
    } else if (newOrderStatus === 'DELIVERED') {
      dateColumnUpdate = `, delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)`;
    } else if (newOrderStatus === 'CANCELLED') {
      const adminReason = (req.body.cancellationReason || req.body.reason || 'Cancelled by Atelier Administrator').trim();
      dateColumnUpdate = `, cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP), cancelled_by = COALESCE(cancelled_by, 'ADMIN'), cancellation_reason = COALESCE(cancellation_reason, ${pool.escape(adminReason)})`;
    }

    let query = `UPDATE orders SET order_status = ?${dateColumnUpdate}`;
    const queryParams: any[] = [newOrderStatus];

    // Auto-transition payment status for Cash on Delivery orders upon delivery
    let targetPaymentStatus: string | null = null;
    if (paymentStatus) {
      targetPaymentStatus = String(paymentStatus).toUpperCase();
    } else if (newOrderStatus === 'DELIVERED') {
      if (paymentMethod === 'COD' || paymentMethod.includes('CASH')) {
        targetPaymentStatus = 'PAID';
        logger.info(`[AUTO-PAYMENT] Order #${id} (COD) marked as DELIVERED -> Auto-updating payment_status to PAID`);
      }
    }

    if (targetPaymentStatus) {
      query += `, payment_status = ?`;
      queryParams.push(targetPaymentStatus);
    }

    if (req.body.trackingCode !== undefined || req.body.tracking_code !== undefined) {
      const codeVal = req.body.trackingCode !== undefined ? req.body.trackingCode : req.body.tracking_code;
      query += `, tracking_code = ?`;
      queryParams.push(codeVal && codeVal.trim() ? codeVal.trim() : null);
    }

    if (req.body.courierName !== undefined || req.body.courier_name !== undefined) {
      const courierVal = req.body.courierName !== undefined ? req.body.courierName : req.body.courier_name;
      query += `, courier_name = ?`;
      queryParams.push(courierVal && courierVal.trim() ? courierVal.trim() : null);
    }

    query += ` WHERE id = ? OR order_number = ?`;
    queryParams.push(id, id);

    const [result]: any = await pool.query(query, queryParams);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: `Order #${id} not found in database.` });
    }

    logger.info(`Order #${id} status updated from ${currentOrderStatus} to ${newOrderStatus} in MySQL DB.`);

    return res.status(200).json({
      success: true,
      message: `Order #${id} status updated to ${newOrderStatus} in database.`,
      data: {
        orderId: id,
        orderStatus: newOrderStatus,
        paymentStatus: targetPaymentStatus || currentPaymentStatus
      }
    });
  } catch (err: any) {
    logger.error(`updateOrderStatus error: ${err.message}`);
    next(err);
  }
};

/**
 * Admin: Update Order Payment Status directly
 * PUT /api/v1/admin/orders/:id/payment-status
 */
export const updateOrderPaymentStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    const newPaymentStatus = (paymentStatus || '').toUpperCase();
    const validPaymentStatuses = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];

    if (!validPaymentStatuses.includes(newPaymentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment status "${newPaymentStatus}". Allowed: ${validPaymentStatuses.join(', ')}`
      });
    }

    const [result]: any = await pool.query(
      `UPDATE orders SET payment_status = ? WHERE id = ? OR order_number = ?`,
      [newPaymentStatus, id, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: `Order #${id} not found in database.` });
    }

    logger.info(`Order #${id} payment status updated to ${newPaymentStatus} by Admin.`);

    return res.status(200).json({
      success: true,
      message: `Order #${id} payment status updated to ${newPaymentStatus}.`,
      data: {
        orderId: id,
        paymentStatus: newPaymentStatus
      }
    });
  } catch (err: any) {
    logger.error(`updateOrderPaymentStatus error: ${err.message}`);
    next(err);
  }
};

/**
 * Admin: Verify Active Admin Session
 */
export const verifyAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      return res.status(403).json({ success: false, message: 'Access denied: Admin role required.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Admin session verified.',
      data: {
        id: user.userId,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Update Profile Credentials (Name, Email, Password)
 */
export const updateAdminProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminUser = req.user;
    if (!adminUser) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    const { name, email, newPassword } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required.' });
    }

    let hashedPassword = null;
    if (newPassword && newPassword.trim().length >= 6) {
      hashedPassword = await bcrypt.hash(newPassword, 12);
    }

    try {
      if (hashedPassword) {
        await pool.query(
          `UPDATE users SET name = ?, email = ?, password = ? WHERE id = ? AND role IN ('ADMIN', 'SUPER_ADMIN')`,
          [name, email, hashedPassword, adminUser.userId]
        );
      } else {
        await pool.query(
          `UPDATE users SET name = ?, email = ? WHERE id = ? AND role IN ('ADMIN', 'SUPER_ADMIN')`,
          [name, email, adminUser.userId]
        );
      }
    } catch (dbErr: any) {
      logger.warn(`MySQL admin profile update warning: ${dbErr.message}`);
    }

    const token = jwt.sign(
      { userId: adminUser.userId, email, role: adminUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    logger.info(`Admin profile updated for ${email} (ID: ${adminUser.userId})`);

    return res.status(200).json({
      success: true,
      message: 'Admin credentials updated successfully.',
      data: {
        user: { id: adminUser.userId, name, email, role: adminUser.role },
        token
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Create New Admin User Account
 */
export const createAdminUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    try {
      const [existing]: any = await pool.query(`SELECT id FROM users WHERE email = ?`, [email]);
      if (existing && existing.length > 0) {
        await pool.query(`UPDATE users SET role = 'ADMIN', password = ? WHERE email = ?`, [hashedPassword, email]);
        logger.info(`Existing account updated to Admin: ${email}`);
        return res.status(200).json({
          success: true,
          message: `Admin access granted to account "${email}".`,
          data: { id: existing[0].id, name, email, role: 'ADMIN' }
        });
      }

      const [result]: any = await pool.query(
        `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'ADMIN')`,
        [name, email, hashedPassword]
      );

      logger.info(`New Admin Account created: ${email} (ID: ${result.insertId})`);
      return res.status(201).json({
        success: true,
        message: 'New Admin user created successfully.',
        data: { id: result.insertId, name, email, role: 'ADMIN' }
      });
    } catch (dbErr: any) {
      logger.error(`DB error creating admin user: ${dbErr.message}`);
      return res.status(500).json({
        success: false,
        message: dbErr.message || 'Failed to create admin user in database.'
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Get All Admin Users from MySQL Database
 */
export const getAdminUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    try {
      const [rows]: any = await pool.query(
        `SELECT id, name, email, role, DATE_FORMAT(created_at, '%d %b %Y') as createdAt FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN') ORDER BY id DESC`
      );
      return res.status(200).json({
        success: true,
        data: rows || []
      });
    } catch (dbErr: any) {
      logger.warn(`Failed to fetch admin users from MySQL: ${dbErr.message}`);
      return res.status(200).json({
        success: true,
        data: []
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Update Admin User Password / Profile Details
 */
export const updateAdminUserPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { password, name, email } = req.body;

    if (!password || password.trim().length < 4) {
      return res.status(400).json({ success: false, message: 'Password must be at least 4 characters long.' });
    }

    const hashedPassword = await bcrypt.hash(password.trim(), 10);

    try {
      const [result]: any = await pool.query(
        `UPDATE users SET password = ? WHERE id = ? OR (email = ? AND email IS NOT NULL AND email != '')`,
        [hashedPassword, id, email || '']
      );

      if (!result || result.affectedRows === 0) {
        if (email) {
          await pool.query(
            `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'ADMIN')
             ON DUPLICATE KEY UPDATE password = VALUES(password)`,
            [name || 'Admin User', email, hashedPassword]
          );
        }
      }

      logger.info(`Password successfully updated in MySQL database for admin user ID: ${id} (${email})`);
    } catch (dbErr: any) {
      logger.warn(`MySQL admin password update error: ${dbErr.message}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Admin user password updated successfully in database.'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Delete Admin User Account
 */
export const deleteAdminUserById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    try {
      await pool.query(`DELETE FROM users WHERE id = ? AND role IN ('ADMIN', 'SUPER_ADMIN')`, [id]);
      logger.info(`Admin user account deleted ID: ${id}`);
    } catch (dbErr: any) {
      logger.warn(`MySQL delete admin user error: ${dbErr.message}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Admin user account revoked and deleted successfully.'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Admin: Get All Orders with Filters
 *
 * Query params:
 *   - status       : order_status filter  (PENDING | PROCESSING | SHIPPED | DELIVERED | CANCELLED)
 *   - paymentStatus: payment_status filter (PENDING | PAID | FAILED | REFUNDED)
 *   - dateFrom     : ISO date string  e.g. 2026-01-01
 *   - dateTo       : ISO date string  e.g. 2026-12-31
 *   - search       : order_number, tracking_code, customer name or email substring
 *   - limit        : page size (default 50)
 *   - offset       : pagination offset (default 0)
 */
export const getAdminOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      status,
      paymentStatus,
      dateFrom,
      dateTo,
      search,
      limit = '10',
      offset = '0'
    } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: any[] = [];

    // Filter by order status
    const validOrderStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (status && validOrderStatuses.includes(status.toUpperCase())) {
      conditions.push(`o.order_status = ?`);
      params.push(status.toUpperCase());
    }

    // Filter by payment status
    const validPaymentStatuses = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];
    if (paymentStatus && validPaymentStatuses.includes(paymentStatus.toUpperCase())) {
      conditions.push(`o.payment_status = ?`);
      params.push(paymentStatus.toUpperCase());
    }

    // Filter by date range (order placed date)
    if (dateFrom) {
      conditions.push(`DATE(o.created_at) >= ?`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`DATE(o.created_at) <= ?`);
      params.push(dateTo);
    }

    // Search by order number, tracking code, customer name or email
    if (search && search.trim()) {
      conditions.push(`(
        o.order_number   LIKE ? OR
        o.tracking_code  LIKE ? OR
        o.customer_name  LIKE ? OR
        o.customer_email LIKE ?
      )`);
      const like = `%${search.trim()}%`;
      params.push(like, like, like, like);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const pageLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 200);
    const pageOffset = Math.max(parseInt(offset, 10) || 0, 0);

    // Main orders query with automatic self-healing fallback for missing columns
    const ordersSql = `SELECT
         o.id,
         o.order_number,
         o.tracking_code,
         o.customer_name,
         o.customer_email,
         o.customer_phone,
         o.shipping_address,
         o.city,
         o.state,
         o.pincode,
         o.subtotal,
         o.shipping_fee,
         o.tax,
         o.total_amount,
         o.payment_method,
         o.payment_status,
         o.order_status,
         o.razorpay_order_id,
         o.razorpay_payment_id,
         o.razorpay_signature,
         o.cancellation_reason,
         o.cancelled_by,
         DATE_FORMAT(o.created_at, '%d %b %Y %H:%i') AS ordered_at,
         DATE_FORMAT(o.paid_at, '%d %b %Y %H:%i') AS paid_at,
         DATE_FORMAT(o.processing_at, '%d %b %Y %H:%i') AS processing_at,
         DATE_FORMAT(o.shipped_at, '%d %b %Y %H:%i') AS shipped_at,
         DATE_FORMAT(o.delivered_at, '%d %b %Y %H:%i') AS delivered_at,
         DATE_FORMAT(o.cancelled_at, '%d %b %Y %H:%i') AS cancelled_at,
         DATE_FORMAT(o.updated_at, '%d %b %Y %H:%i') AS updated_at
       FROM orders o
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`;

    let orders: any;
    try {
      [orders] = await pool.query(ordersSql, [...params, pageLimit, pageOffset]);
    } catch (queryErr: any) {
      if (queryErr.code === 'ER_BAD_FIELD_ERROR' || (queryErr.message && queryErr.message.includes('Unknown column'))) {
        logger.warn(`Auto-healing missing columns in orders table: ${queryErr.message}`);
        try { await pool.query(`ALTER TABLE \`orders\` ADD COLUMN \`tracking_code\` VARCHAR(50) DEFAULT NULL;`); } catch (e) {}
        try { await pool.query(`ALTER TABLE \`orders\` ADD COLUMN \`invoice_number\` VARCHAR(50) DEFAULT NULL;`); } catch (e) {}
        try { await pool.query(`ALTER TABLE \`orders\` ADD COLUMN \`courier_name\` VARCHAR(100) DEFAULT NULL;`); } catch (e) {}
        try { await pool.query(`ALTER TABLE \`orders\` ADD COLUMN \`processing_at\` TIMESTAMP NULL DEFAULT NULL;`); } catch (e) {}
        try { await pool.query(`ALTER TABLE \`orders\` ADD COLUMN \`shipped_at\` TIMESTAMP NULL DEFAULT NULL;`); } catch (e) {}
        try { await pool.query(`ALTER TABLE \`orders\` ADD COLUMN \`delivered_at\` TIMESTAMP NULL DEFAULT NULL;`); } catch (e) {}
        try { await pool.query(`ALTER TABLE \`orders\` ADD COLUMN \`cancelled_at\` TIMESTAMP NULL DEFAULT NULL;`); } catch (e) {}
        try { await pool.query(`ALTER TABLE \`orders\` ADD COLUMN \`cancellation_reason\` VARCHAR(255) DEFAULT NULL;`); } catch (e) {}
        try { await pool.query(`ALTER TABLE \`orders\` ADD COLUMN \`cancelled_by\` VARCHAR(50) DEFAULT NULL;`); } catch (e) {}
        // Retry query with newly migrated columns
        [orders] = await pool.query(ordersSql, [...params, pageLimit, pageOffset]);
      } else {
        throw queryErr;
      }
    }

    // Count query for pagination metadata
    const [countResult]: any = await pool.query(
      `SELECT COUNT(*) as total FROM orders o ${whereClause}`,
      params
    );
    const total = Number(countResult[0]?.total || 0);

    // Aggregation query for order financial summary metrics
    const [summaryResult]: any = await pool.query(
      `SELECT 
         COALESCE(SUM(o.total_amount), 0) as totalRevenue,
         COALESCE(SUM(CASE WHEN o.payment_status = 'PAID' THEN o.total_amount ELSE 0 END), 0) as paidRevenue,
         COALESCE(SUM(CASE WHEN o.payment_status = 'PENDING' THEN o.total_amount ELSE 0 END), 0) as pendingRevenue,
         COALESCE(SUM(CASE WHEN o.order_status = 'CANCELLED' THEN o.total_amount ELSE 0 END), 0) as cancelledRevenue
       FROM orders o ${whereClause}`,
      params
    );
    const summaryData = summaryResult && summaryResult[0] ? summaryResult[0] : {};

    // Fetch order items for each order
    const ordersWithItems = await Promise.all(
      (orders || []).map(async (order: any) => {
        try {
          const [items]: any = await pool.query(
            `SELECT
               oi.id,
               oi.product_name,
               oi.unit_price,
               oi.metal_type,
               oi.quantity,
               oi.total_price
             FROM order_items oi
             WHERE oi.order_id = ?
             ORDER BY oi.id ASC`,
            [order.id]
          );
          return { ...order, items: items || [] };
        } catch {
          return { ...order, items: [] };
        }
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        orders: ordersWithItems,
        summary: {
          totalRevenue: Number(summaryData.totalRevenue || 0),
          paidRevenue: Number(summaryData.paidRevenue || 0),
          pendingRevenue: Number(summaryData.pendingRevenue || 0),
          cancelledRevenue: Number(summaryData.cancelledRevenue || 0)
        },
        pagination: {
          total,
          limit: pageLimit,
          offset: pageOffset,
          pages: Math.ceil(total / pageLimit)
        }
      }
    });
  } catch (err: any) {
    logger.error(`getAdminOrders error: ${err.message}`);
    next(err);
  }
};
