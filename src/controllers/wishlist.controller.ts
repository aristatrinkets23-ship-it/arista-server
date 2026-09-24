import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { getDefaultPlaceholder } from './product.controller';

/**
 * Get all items in wishlist for user or session
 */
export const getWishlist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user ? (req as any).user.id : null;
    const sessionId = (req.headers['x-session-id'] as string) || 'guest-session';

    let query = `
      SELECT 
        w.id as wishlist_id, 
        w.slug as wishlist_slug, 
        w.product_id as wishlist_product_id, 
        w.product_data, 
        p.id as prod_id, 
        p.name as prod_name, 
        p.slug as prod_slug, 
        p.price as prod_price, 
        p.compare_at_price as prod_compare_at_price, 
        p.badge as prod_badge, 
        p.image as prod_image, 
        c.name as category_name
      FROM wishlist_items w
      LEFT JOIN products p ON (w.product_id = p.id OR (w.slug IS NOT NULL AND w.slug != '' AND w.slug = p.slug))
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (userId) {
      query += ` AND (w.user_id = ? OR w.session_id = ?)`;
      params.push(userId, sessionId);
    } else {
      query += ` AND w.session_id = ?`;
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

      const itemSlug = row.wishlist_slug || row.prod_slug || extraData.slug;
      const itemId = row.prod_id || row.wishlist_product_id || extraData.id || row.wishlist_id;
      const itemName = row.prod_name || extraData.name || 'Handcrafted Fine Jewellery';
      const itemPrice = row.prod_price !== null && row.prod_price !== undefined ? Number(row.prod_price) : Number(extraData.price || 0);
      const itemComparePrice = row.prod_compare_at_price !== null && row.prod_compare_at_price !== undefined
        ? Number(row.prod_compare_at_price)
        : (extraData.compareAtPrice ? Number(extraData.compareAtPrice) : undefined);
      
      const rawImage = (extraData && extraData.image && String(extraData.image).trim() !== '')
        ? extraData.image
        : (row.prod_image && String(row.prod_image).trim() !== '' ? row.prod_image : '');
      const img = rawImage && String(rawImage).trim() !== '' ? rawImage : (row.prod_image || extraData.image || '');

      return {
        id: itemId,
        wishlist_id: row.wishlist_id,
        name: itemName,
        slug: itemSlug,
        price: itemPrice,
        compareAtPrice: itemComparePrice,
        image: img,
        images: extraData.images && extraData.images.length > 0 ? extraData.images : [img],
        category: row.category_name || extraData.category || 'Fine Jewellery',
        badge: row.prod_badge || extraData.badge || undefined,
        available: true,
        ratingAverage: extraData.ratingAverage || 5.0,
        reviewCount: extraData.reviewCount || 1
      };
    });

    // Sort items in JS memory by wishlist_id DESC to avoid MySQL sort buffer limits on JSON/LONGTEXT columns
    items.sort((a: any, b: any) => (b.wishlist_id || 0) - (a.wishlist_id || 0));

    return res.status(200).json({
      success: true,
      count: items.length,
      data: items
    });
  } catch (err: any) {
    return next(err);
  }
};

/**
 * Toggle product in wishlist (POST /api/wishlist/toggle)
 */
export const toggleWishlist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user ? (req as any).user.id : null;
    const sessionId = (req.headers['x-session-id'] as string) || 'guest-session';
    const { productId, slug, product } = req.body;

    const targetSlug = slug || (product ? product.slug : null);
    const targetProdId = productId || (product ? product.id : null);

    if (!targetSlug && !targetProdId) {
      return res.status(400).json({ success: false, message: 'Product slug or ID is required.' });
    }

    let checkQuery = `SELECT id FROM wishlist_items WHERE `;
    const checkParams: any[] = [];

    if (userId) {
      checkQuery += `(user_id = ? OR session_id = ?)`;
      checkParams.push(userId, sessionId);
    } else {
      checkQuery += `session_id = ?`;
      checkParams.push(sessionId);
    }

    if (targetSlug && targetProdId) {
      checkQuery += ` AND (slug = ? OR product_id = ?)`;
      checkParams.push(String(targetSlug), Number(targetProdId));
    } else if (targetSlug) {
      checkQuery += ` AND slug = ?`;
      checkParams.push(String(targetSlug));
    } else if (targetProdId) {
      checkQuery += ` AND product_id = ?`;
      checkParams.push(Number(targetProdId));
    }

    const [existing]: any = await pool.query(checkQuery, checkParams);

    if (existing && existing.length > 0) {
      // Delete all matching instances for this user/session to prevent stale duplicates
      for (const row of existing) {
        await pool.query(`DELETE FROM wishlist_items WHERE id = ?`, [row.id]);
      }
      return res.status(200).json({
        success: true,
        added: false,
        message: 'Removed from wishlist'
      });
    } else {
      // Insert into wishlist
      const productJson = product ? JSON.stringify(product) : null;
      await pool.query(
        `INSERT INTO wishlist_items (user_id, session_id, product_id, slug, product_data) VALUES (?, ?, ?, ?, ?)`,
        [userId, sessionId, targetProdId && !isNaN(Number(targetProdId)) ? Number(targetProdId) : null, targetSlug || '', productJson]
      );
      return res.status(200).json({
        success: true,
        added: true,
        message: 'Added to wishlist'
      });
    }
  } catch (err: any) {
    return next(err);
  }
};

/**
 * Remove specific item from wishlist (DELETE /api/wishlist/:idOrSlug)
 */
export const removeFromWishlist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user ? (req as any).user.id : null;
    const sessionId = (req.headers['x-session-id'] as string) || 'guest-session';
    const { idOrSlug } = req.params;

    const isNum = !isNaN(Number(idOrSlug)) && Number(idOrSlug) > 0;

    let deleteQuery = `DELETE FROM wishlist_items WHERE `;
    const deleteParams: any[] = [];

    if (userId) {
      deleteQuery += `(user_id = ? OR session_id = ?)`;
      deleteParams.push(userId, sessionId);
    } else {
      deleteQuery += `session_id = ?`;
      deleteParams.push(sessionId);
    }

    if (isNum) {
      deleteQuery += ` AND (id = ? OR product_id = ? OR slug = ?)`;
      deleteParams.push(Number(idOrSlug), Number(idOrSlug), String(idOrSlug));
    } else {
      deleteQuery += ` AND slug = ?`;
      deleteParams.push(String(idOrSlug));
    }

    await pool.query(deleteQuery, deleteParams);

    return res.status(200).json({
      success: true,
      message: 'Item removed from wishlist'
    });
  } catch (err: any) {
    return next(err);
  }
};

/**
 * Clear all items in wishlist (DELETE /api/wishlist/clear)
 */
export const clearWishlist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user ? (req as any).user.id : null;
    const sessionId = (req.headers['x-session-id'] as string) || 'guest-session';

    let deleteQuery = `DELETE FROM wishlist_items WHERE `;
    const deleteParams: any[] = [];

    if (userId) {
      deleteQuery += `(user_id = ? OR session_id = ?)`;
      deleteParams.push(userId, sessionId);
    } else {
      deleteQuery += `session_id = ?`;
      deleteParams.push(sessionId);
    }

    await pool.query(deleteQuery, deleteParams);

    return res.status(200).json({
      success: true,
      message: 'Wishlist cleared successfully'
    });
  } catch (err: any) {
    return next(err);
  }
};

