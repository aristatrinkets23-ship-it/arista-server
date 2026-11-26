import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';

export function getDefaultPlaceholder(nameOrCategory?: string): string {
  if (!nameOrCategory) return '/assets/images/precious-jewellery-hero.webp';
  const s = nameOrCategory.toLowerCase();
  if (s.includes('ring')) return '/assets/images/occasion-daily-wear.webp';
  if (s.includes('necklace') || s.includes('pendant') || s.includes('choker')) return '/assets/images/occasion-wedding.webp';
  if (s.includes('earring') || s.includes('stud') || s.includes('hoop')) return '/assets/images/occasion-gifting.webp';
  if (s.includes('bracelet') || s.includes('bangle') || s.includes('cuff')) return '/assets/images/occasion-festive.webp';
  return '/assets/images/precious-jewellery-hero.webp';
}

/**
 * Get all catalog products from database
 */
export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, sort, search, includeInactive, limit, page, offset } = req.query;

    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const queryParams: any[] = [];

    if (includeInactive !== 'true') {
      query += ` AND (p.is_active = 1 OR p.is_active IS NULL)`;
    }

    if (category && category !== 'all') {
      const cleanCat = String(category).trim().toLowerCase();
      const hyphenCat = cleanCat.replace(/[\s_]+/g, '-');
      query += ` AND (LOWER(c.slug) = ? OR LOWER(c.name) = ? OR LOWER(REPLACE(c.name, ' ', '-')) = ? OR LOWER(REPLACE(c.slug, '-', ' ')) = ?)`;
      queryParams.push(cleanCat, cleanCat, hyphenCat, cleanCat);
    }

    if (search) {
      query += ` AND (LOWER(p.name) LIKE LOWER(?) OR LOWER(p.description) LIKE LOWER(?))`;
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (sort === 'price-low') {
      query += ` ORDER BY p.price ASC, p.id DESC`;
    } else if (sort === 'price-high') {
      query += ` ORDER BY p.price DESC, p.id DESC`;
    } else if (sort === 'newest') {
      query += ` ORDER BY (CASE WHEN UPPER(p.badge) = 'NEW' THEN 1 ELSE 0 END) DESC, p.created_at DESC, p.id DESC`;
    } else {
      query += ` ORDER BY p.id DESC`;
    }

    if (limit) {
      const pageLimit = Math.max(1, Math.min(200, Number(limit)));
      const pageOffset = offset ? Math.max(0, Number(offset)) : (page ? (Math.max(1, Number(page)) - 1) * pageLimit : 0);
      query += ` LIMIT ? OFFSET ?`;
      queryParams.push(pageLimit, pageOffset);
    }

    const [rows]: any = await pool.query(query, queryParams);
    let imgsByProductId: Record<number, string[]> = {};
    let specsByProductId: Record<number, any[]> = {};

    if (rows && rows.length > 0) {
      const productIds = rows.map((r: any) => r.id);
      try {
        const [[allImgs], [allSpecs]]: any = await Promise.all([
          pool.query(
            `SELECT product_id, image_url FROM product_images WHERE product_id IN (?) ORDER BY sort_order ASC`,
            [productIds]
          ),
          pool.query(
            `SELECT product_id, spec_label as label, spec_value as value FROM product_specifications WHERE product_id IN (?)`,
            [productIds]
          )
        ]);

        if (Array.isArray(allImgs)) {
          for (const img of allImgs) {
            if (!imgsByProductId[img.product_id]) imgsByProductId[img.product_id] = [];
            imgsByProductId[img.product_id].push(img.image_url);
          }
        }

        if (Array.isArray(allSpecs)) {
          for (const spec of allSpecs) {
            if (!specsByProductId[spec.product_id]) specsByProductId[spec.product_id] = [];
            specsByProductId[spec.product_id].push({ label: spec.label, value: spec.value });
          }
        }
      } catch (batchErr) {
        // Fallback gracefully
      }
    }

    const mappedRows = (rows || []).map((row: any) => {
      const finalImage = row.image && row.image.trim() !== '' ? row.image : (row.image || '');
      const imagesList = (imgsByProductId[row.id] && imgsByProductId[row.id].length > 0)
        ? imgsByProductId[row.id]
        : [finalImage];
      const specsList = specsByProductId[row.id] || [];

      let parsedMaterials: string[] = [];
      if (Array.isArray(row.materials)) {
        parsedMaterials = row.materials;
      } else if (typeof row.materials === 'string' && row.materials.trim() !== '') {
        try {
          parsedMaterials = JSON.parse(row.materials);
        } catch (e) {
          parsedMaterials = row.materials.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }

      return {
        ...row,
        category: row.category_name || row.category || '',
        image: finalImage,
        images: imagesList,
        materials: parsedMaterials,
        careGuide: row.care_guide || row.careGuide || '',
        shippingInfo: row.shipping_info || row.shippingInfo || '',
        specifications: specsList
      };
    });

    if (includeInactive !== 'true') {
      res.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    }

    return res.status(200).json({ success: true, count: mappedRows.length, data: mappedRows });
  } catch (err) {
    next(err);
  }
};

/**
 * Get single product by slug from database
 */
export const getProductBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;

    const [rows]: any = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.slug = ?`,
      [slug]
    );

    if (rows && rows.length > 0) {
      const product = rows[0];
      if ((product.is_active === 0 || product.is_active === false) && req.query.includeInactive !== 'true') {
        return res.status(404).json({ success: false, message: 'Product is currently inactive.' });
      }
      const finalImage = product.image && product.image.trim() !== '' ? product.image : (product.image || '');
      const [specs]: any = await pool.query(`SELECT spec_label as label, spec_value as value FROM product_specifications WHERE product_id = ?`, [product.id]);
      const [imgs]: any = await pool.query(`SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC`, [product.id]);

      let parsedMaterials: string[] = [];
      if (Array.isArray(product.materials)) {
        parsedMaterials = product.materials;
      } else if (typeof product.materials === 'string' && product.materials.trim() !== '') {
        try {
          parsedMaterials = JSON.parse(product.materials);
        } catch (e) {
          parsedMaterials = product.materials.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          ...product,
          category: product.category_name || product.category || '',
          image: finalImage,
          images: imgs && imgs.length > 0 ? imgs.map((i: any) => i.image_url) : [finalImage],
          materials: parsedMaterials,
          careGuide: product.care_guide || product.careGuide || '',
          shippingInfo: product.shipping_info || product.shippingInfo || '',
          specifications: specs || []
        }
      });
    }

    return res.status(404).json({ success: false, message: 'Product not found.' });
  } catch (err) {
    next(err);
  }
};

/**
 * Get all product categories from database with accurate item counts
 */
export const getCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT c.*, 
             (
               SELECT COUNT(*) 
               FROM products p 
               WHERE p.category_id = c.id 
                  OR (p.category_id IS NULL AND (LOWER(p.name) LIKE CONCAT('%', LOWER(c.slug), '%') OR LOWER(p.slug) LIKE CONCAT('%', LOWER(c.slug), '%')))
             ) AS item_count
      FROM categories c 
      ORDER BY c.id ASC
    `);

    // Precomputed item_count from SQL subquery (RULE-001: No queries in loops)

    const mappedCats = (rows || []).map((c: any) => ({
      ...c,
      item_count: Number(c.item_count || 0),
      image: c.image && c.image.trim() !== '' ? c.image : getDefaultPlaceholder(c.slug || c.name)
    }));

    return res.status(200).json({ success: true, count: mappedCats.length, data: mappedCats });
  } catch (err) {
    next(err);
  }
};
