import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';

export function getDefaultPlaceholder(nameOrCategory?: string): string {
  if (!nameOrCategory) return '/assets/images/placeholder-jewellery.svg';
  const s = nameOrCategory.toLowerCase();
  if (s.includes('ring')) return '/assets/images/placeholder-rings.svg';
  if (s.includes('necklace') || s.includes('pendant') || s.includes('choker')) return '/assets/images/placeholder-necklaces.svg';
  if (s.includes('earring') || s.includes('stud') || s.includes('hoop')) return '/assets/images/placeholder-earrings.svg';
  if (s.includes('bracelet') || s.includes('bangle') || s.includes('cuff')) return '/assets/images/placeholder-bracelets.svg';
  return '/assets/images/placeholder-jewellery.svg';
}

/**
 * Get all catalog products from database
 */
export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, sort, search } = req.query;

    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const queryParams: any[] = [];

    if (category && category !== 'all') {
      query += ` AND LOWER(c.slug) = LOWER(?)`;
      queryParams.push(category);
    }

    if (search) {
      query += ` AND (LOWER(p.name) LIKE LOWER(?) OR LOWER(p.description) LIKE LOWER(?))`;
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (sort === 'price-low') {
      query += ` ORDER BY p.price ASC`;
    } else if (sort === 'price-high') {
      query += ` ORDER BY p.price DESC`;
    } else if (sort === 'newest') {
      query += ` ORDER BY p.created_at DESC`;
    } else {
      query += ` ORDER BY p.id ASC`;
    }

    const [rows]: any = await pool.query(query, queryParams);
    const mappedRows = await Promise.all(
      (rows || []).map(async (row: any) => {
        const finalImage = row.image && row.image.trim() !== '' ? row.image : getDefaultPlaceholder(row.category_name || row.name);
        try {
          const [imgs]: any = await pool.query(
            `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC`,
            [row.id]
          );
          const imagesList = imgs && imgs.length > 0
            ? imgs.map((i: any) => i.image_url)
            : [finalImage];

          const [specs]: any = await pool.query(
            `SELECT spec_label as label, spec_value as value FROM product_specifications WHERE product_id = ?`,
            [row.id]
          );

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
            specifications: specs || []
          };
        } catch (err) {
          return {
            ...row,
            category: row.category_name || row.category || '',
            image: finalImage,
            images: [finalImage],
            careGuide: row.care_guide || row.careGuide || '',
            shippingInfo: row.shipping_info || row.shippingInfo || '',
            specifications: []
          };
        }
      })
    );

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
      const finalImage = product.image && product.image.trim() !== '' ? product.image : getDefaultPlaceholder(product.category_name || product.name);
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

    for (const cat of rows || []) {
      try {
        await pool.query(`UPDATE categories SET item_count = ? WHERE id = ?`, [cat.item_count, cat.id]);
      } catch (e) {}
    }

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
