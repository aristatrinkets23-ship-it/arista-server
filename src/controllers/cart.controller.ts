import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { getDefaultPlaceholder } from './product.controller';

const CART_EXPIRY_DAYS = Number(process.env.CART_EXPIRY_DAYS) || 30;

/**
 * Helper to get authenticated user ID (from JWT) or guest session ID header
 */
const getAuthAndSession = (req: Request) => {
  const user = (req as any).user;
  const userId = user ? Number(user.userId || user.id) : null;
  const sessionId = (req.headers['x-session-id'] as string) || 'guest-session';
  return { userId, sessionId };
};

/**
 * Purge cart items in database older than CART_EXPIRY_DAYS (30 days default)
 */
const purgeExpiredDbCartItems = async () => {
  try {
    await pool.query(
      `DELETE FROM cart_items WHERE updated_at < NOW() - INTERVAL ? DAY`,
      [CART_EXPIRY_DAYS]
    );
  } catch (err) {
    console.warn('Could not purge expired cart items:', err);
  }
};

/**
 * Fetch DB cart items and recalculate totals strictly from DB product prices
 */
const fetchDbCartItems = async (userId: number | null, sessionId: string) => {
  await purgeExpiredDbCartItems();

  let query = `
    SELECT 
      c.id as cart_item_id,
      c.user_id,
      c.session_id,
      c.product_id,
      c.slug as cart_slug,
      c.metal_type,
      c.quantity,
      c.product_data,
      c.created_at,
      c.updated_at,
      p.id as prod_id,
      p.name as prod_name,
      p.slug as prod_slug,
      p.price as prod_price,
      p.compare_at_price as prod_compare_at_price,
      p.badge as prod_badge,
      p.image as prod_image,
      p.in_stock as prod_in_stock,
      cat.name as category_name
    FROM cart_items c
    LEFT JOIN products p ON (c.product_id = p.id OR (c.slug IS NOT NULL AND c.slug != '' AND c.slug = p.slug))
    LEFT JOIN categories cat ON p.category_id = cat.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (userId) {
    query += ` AND (c.user_id = ? OR c.session_id = ?)`;
    params.push(userId, sessionId);
  } else {
    query += ` AND c.session_id = ?`;
    params.push(sessionId);
  }

  const [rows]: any = await pool.query(query, params);

  const items = (rows || []).map((row: any) => {
    let extraData: any = {};
    if (row.product_data) {
      try {
        extraData = typeof row.product_data === 'string' ? JSON.parse(row.product_data) : row.product_data;
      } catch (e) {}
    }

    const itemSlug = row.prod_slug || row.cart_slug || extraData.slug;
    const itemId = row.prod_id || row.product_id || extraData.id || row.cart_item_id;
    const itemName = row.prod_name || extraData.name || 'Demi Fine, Anti Tarnish Jewellery';
    
    // STRICT SECURITY: Use DB product price first, fallback to product_data price
    const itemPrice = row.prod_price !== null && row.prod_price !== undefined 
      ? Number(row.prod_price) 
      : Number(extraData.price || 0);

    const itemComparePrice = row.prod_compare_at_price !== null && row.prod_compare_at_price !== undefined
      ? Number(row.prod_compare_at_price)
      : (extraData.compareAtPrice ? Number(extraData.compareAtPrice) : undefined);

    const rawImage = (extraData && extraData.image && String(extraData.image).trim() !== '')
      ? extraData.image
      : (row.prod_image && String(row.prod_image).trim() !== '' ? row.prod_image : '');
    const img = rawImage && String(rawImage).trim() !== '' ? rawImage : (row.prod_image || extraData.image || '');

    const qty = Math.max(1, Number(row.quantity) || 1);
    const selectedMetal = row.metal_type || extraData.selectedMetal || '18K Warm Gold';
    const inStock = row.prod_in_stock !== undefined && row.prod_in_stock !== null ? Boolean(row.prod_in_stock) : true;

    return {
      product: {
        id: itemId,
        name: itemName,
        slug: itemSlug,
        price: itemPrice,
        compareAtPrice: itemComparePrice,
        image: img,
        category: row.category_name || extraData.category || 'Fine Jewellery',
        badge: row.prod_badge || extraData.badge || undefined,
        inStock
      },
      quantity: qty,
      selectedMetal,
      subtotal: itemPrice * qty,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });

  return items;
};

/**
 * Recalculate summary totals securely on server
 */
const calculateCartSummary = (items: any[]) => {
  const validItems = Array.isArray(items) ? items : [];
  const itemCount = validItems.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  const subtotal = validItems.reduce((acc, item) => {
    const price = Number(item.product?.price) || 0;
    const qty = Number(item.quantity) || 0;
    return acc + (price * qty);
  }, 0);
  const estimatedShipping = subtotal > 5000 || subtotal === 0 ? 0 : 500;
  const estimatedTax = Math.round(subtotal * 0.03); // 3% GST
  const total = subtotal + estimatedShipping + estimatedTax;

  return {
    items: validItems,
    itemCount,
    subtotal,
    estimatedShipping,
    estimatedTax,
    total,
    expiryDays: CART_EXPIRY_DAYS
  };
};

/**
 * GET /api/cart or GET /api/cart/items
 */
export const getCart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, sessionId } = getAuthAndSession(req);
    const items = await fetchDbCartItems(userId, sessionId);
    const summary = calculateCartSummary(items);

    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/cart or POST /api/cart/items
 * Add an item or increase quantity securely
 */
export const addToCart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, sessionId } = getAuthAndSession(req);
    const { product, productId, quantity = 1, selectedMetal = '18K Warm Gold' } = req.body;

    const targetProduct = product || { id: productId };
    if (!targetProduct || (!targetProduct.id && !targetProduct.slug)) {
      return res.status(400).json({ success: false, message: 'Valid product details required' });
    }

    const prodId = (targetProduct.id !== undefined && targetProduct.id !== null && !isNaN(Number(targetProduct.id))) ? Number(targetProduct.id) : null;
    const prodSlug = targetProduct.slug || (targetProduct.name ? targetProduct.name.toLowerCase().replace(/\s+/g, '-') : null);
    const addQty = Math.max(1, Number(quantity) || 1);

    // Validate product in DB & resolve valid foreign key product_id
    let validDbProductId: number | null = null;
    if (prodId || prodSlug) {
      const [pRows]: any = await pool.query(
        `SELECT id, price, in_stock FROM products WHERE id = ? OR slug = ?`,
        [prodId, prodSlug]
      );
      if (pRows && pRows.length > 0) {
        if (!pRows[0].in_stock) {
          return res.status(400).json({ success: false, message: 'This item is currently out of stock.' });
        }
        validDbProductId = pRows[0].id;
      }
    }

    // Check if item already exists in cart for this user/session
    let findQuery = `SELECT id, quantity FROM cart_items WHERE metal_type = ?`;
    const findParams: any[] = [selectedMetal];

    if (userId) {
      findQuery += ` AND (user_id = ? OR session_id = ?)`;
      findParams.push(userId, sessionId);
    } else {
      findQuery += ` AND session_id = ?`;
      findParams.push(sessionId);
    }

    if (validDbProductId) {
      findQuery += ` AND (product_id = ? OR slug = ?)`;
      findParams.push(validDbProductId, prodSlug);
    } else if (prodSlug) {
      findQuery += ` AND slug = ?`;
      findParams.push(prodSlug);
    }

    const [existingRows]: any = await pool.query(findQuery, findParams);

    if (existingRows && existingRows.length > 0) {
      const existingId = existingRows[0].id;
      const newQty = existingRows[0].quantity + addQty;
      await pool.query(
        `UPDATE cart_items SET quantity = ?, user_id = COALESCE(?, user_id), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newQty, userId, existingId]
      );
    } else {
      await pool.query(
        `INSERT INTO cart_items (user_id, session_id, product_id, slug, product_data, metal_type, quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          sessionId,
          validDbProductId,
          prodSlug,
          JSON.stringify(targetProduct),
          selectedMetal,
          addQty
        ]
      );
    }

    const items = await fetchDbCartItems(userId, sessionId);
    const summary = calculateCartSummary(items);

    return res.status(200).json({
      success: true,
      message: 'Item added to shopping cart',
      data: summary
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * PATCH /api/cart/items/:productId
 * Update item quantity
 */
export const updateCartItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, sessionId } = getAuthAndSession(req);
    const paramId = req.params.productId;
    const bodyId = req.body.productId || req.body.slug;
    const targetId = paramId || bodyId;
    const { quantity, selectedMetal } = req.body;

    const newQty = Number(quantity);
    if (!targetId) {
      return res.status(400).json({ success: false, message: 'Product identifier required' });
    }

    if (isNaN(newQty) || newQty <= 0) {
      let delQuery = `DELETE FROM cart_items WHERE 1=1`;
      const delParams: any[] = [];

      if (userId) {
        delQuery += ` AND (user_id = ? OR session_id = ?)`;
        delParams.push(userId, sessionId);
      } else {
        delQuery += ` AND session_id = ?`;
        delParams.push(sessionId);
      }

      delQuery += ` AND (product_id = ? OR slug = ?)`;
      delParams.push(targetId, targetId);

      if (selectedMetal) {
        delQuery += ` AND metal_type = ?`;
        delParams.push(selectedMetal);
      }

      await pool.query(delQuery, delParams);
    } else {
      let updQuery = `UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE 1=1`;
      const updParams: any[] = [newQty];

      if (userId) {
        updQuery += ` AND (user_id = ? OR session_id = ?)`;
        updParams.push(userId, sessionId);
      } else {
        updQuery += ` AND session_id = ?`;
        updParams.push(sessionId);
      }

      updQuery += ` AND (product_id = ? OR slug = ?)`;
      updParams.push(targetId, targetId);

      if (selectedMetal) {
        updQuery += ` AND metal_type = ?`;
        updParams.push(selectedMetal);
      }

      await pool.query(updQuery, updParams);
    }

    const items = await fetchDbCartItems(userId, sessionId);
    const summary = calculateCartSummary(items);

    return res.status(200).json({
      success: true,
      message: 'Cart item quantity updated',
      data: summary
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /api/cart/items/:productId
 * Remove an item from cart
 */
export const removeCartItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, sessionId } = getAuthAndSession(req);
    const targetId = req.params.productId || req.params.idOrSlug;
    const selectedMetal = req.query.selectedMetal as string;

    if (!targetId) {
      return res.status(400).json({ success: false, message: 'Product identifier required' });
    }

    let delQuery = `DELETE FROM cart_items WHERE 1=1`;
    const delParams: any[] = [];

    if (userId) {
      delQuery += ` AND (user_id = ? OR session_id = ?)`;
      delParams.push(userId, sessionId);
    } else {
      delQuery += ` AND session_id = ?`;
      delParams.push(sessionId);
    }

    delQuery += ` AND (product_id = ? OR slug = ?)`;
    delParams.push(targetId, targetId);

    if (selectedMetal) {
      delQuery += ` AND metal_type = ?`;
      delParams.push(selectedMetal);
    }

    await pool.query(delQuery, delParams);

    const items = await fetchDbCartItems(userId, sessionId);
    const summary = calculateCartSummary(items);

    return res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      data: summary
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * DELETE /api/cart
 */
export const clearCart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, sessionId } = getAuthAndSession(req);

    let delQuery = `DELETE FROM cart_items WHERE 1=1`;
    const delParams: any[] = [];

    if (userId) {
      delQuery += ` AND (user_id = ? OR session_id = ?)`;
      delParams.push(userId, sessionId);
    } else {
      delQuery += ` AND session_id = ?`;
      delParams.push(sessionId);
    }

    await pool.query(delQuery, delParams);

    const items = await fetchDbCartItems(userId, sessionId);
    const summary = calculateCartSummary(items);

    return res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: summary
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/cart/merge
 */
export const mergeCart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user || (!user.userId && !user.id)) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Valid user token required to merge cart' });
    }
    const userId = Number(user.userId || user.id);
    const sessionId = (req.headers['x-session-id'] as string) || 'guest-session';
    const { guestItems = [] } = req.body;

    await pool.query(
      `UPDATE cart_items SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND (user_id IS NULL OR user_id = 0)`,
      [userId, sessionId]
    );

    if (Array.isArray(guestItems) && guestItems.length > 0) {
      for (const item of guestItems) {
        if (!item || !item.product) continue;
        const prod = item.product;
        const prodId = (prod.id !== undefined && prod.id !== null && !isNaN(Number(prod.id))) ? Number(prod.id) : null;
        const prodSlug = prod.slug || (prod.name ? prod.name.toLowerCase().replace(/\s+/g, '-') : null);
        const addQty = Math.max(1, Number(item.quantity) || 1);
        const metal = item.selectedMetal || '18K Warm Gold';

        let validDbProductId: number | null = null;
        if (prodId || prodSlug) {
          const [pRows]: any = await pool.query(
            `SELECT id FROM products WHERE id = ? OR slug = ?`,
            [prodId, prodSlug]
          );
          if (pRows && pRows.length > 0) {
            validDbProductId = pRows[0].id;
          }
        }

        let findQuery = `SELECT id, quantity FROM cart_items WHERE user_id = ? AND metal_type = ?`;
        const findParams: any[] = [userId, metal];

        if (validDbProductId) {
          findQuery += ` AND (product_id = ? OR slug = ?)`;
          findParams.push(validDbProductId, prodSlug);
        } else if (prodSlug) {
          findQuery += ` AND slug = ?`;
          findParams.push(prodSlug);
        }

        const [rows]: any = await pool.query(findQuery, findParams);

        if (rows && rows.length > 0) {
          const newQty = rows[0].quantity + addQty;
          await pool.query(
            `UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [newQty, rows[0].id]
          );
        } else {
          await pool.query(
            `INSERT INTO cart_items (user_id, session_id, product_id, slug, product_data, metal_type, quantity)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              sessionId,
              validDbProductId,
              prodSlug,
              JSON.stringify(prod),
              metal,
              addQty
            ]
          );
        }
      }
    }

    const mergedItems = await fetchDbCartItems(userId, sessionId);
    const summary = calculateCartSummary(mergedItems);

    return res.status(200).json({
      success: true,
      message: 'Guest cart merged into user account successfully',
      data: summary
    });
  } catch (err) {
    return next(err);
  }
};
