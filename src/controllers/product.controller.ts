import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';

// Mock data fallback if database is not connected
const fallbackCategories = [
  {
    id: 1,
    name: 'Rings',
    slug: 'rings',
    description: 'Handcrafted solitaire, halo, and eternity rings set in 18K gold.',
    image: '/assets/images/slideshow-couple-rings.jpg',
    itemCount: 42
  },
  {
    id: 2,
    name: 'Necklaces',
    slug: 'necklaces',
    description: 'Elegant chokers, pendants, and layered chains designed to accentuate necklines.',
    image: '/assets/images/slideshow-girl-necklace.jpg',
    itemCount: 36
  },
  {
    id: 3,
    name: 'Earrings',
    slug: 'earrings',
    description: 'Luminous freshwater pearl drop earrings, diamond studs, and gold hoops.',
    image: '/assets/images/slideshow-earrings.jpg',
    itemCount: 28
  },
  {
    id: 4,
    name: 'Bracelets',
    slug: 'bracelets',
    description: 'Timeless diamond cuff bracelets, delicate tennis chains, and bangles.',
    image: '/assets/images/slideshow-bangles.jpg',
    itemCount: 24
  }
];

const fallbackProducts = [
  {
    id: 1,
    name: 'Eternal Solitaire Diamond Ring',
    slug: 'eternal-solitaire-diamond-ring',
    category: 'Rings',
    price: 45000,
    compareAtPrice: 52000,
    badge: 'FEATURED',
    metalType: '18K Warm Gold',
    gemstone: 'Diamond (1.2 ct)',
    inStock: true,
    stockQuantity: 12,
    description: 'A brilliant 1.2-carat ethically sourced round solitaire diamond crowned upon an 18K warm gold band.',
    materials: '18K Warm Gold, Ethically Sourced Diamond',
    careGuide: 'Clean gently with lukewarm soapy water and a soft microfiber cloth.',
    shippingInfo: 'Complimentary insured express delivery within 3-5 business days.',
    image: '/assets/images/slideshow-couple-rings.jpg',
    images: ['/assets/images/slideshow-couple-rings.jpg', '/assets/images/slideshow-rings.jpg'],
    specifications: [
      { label: 'Metal', value: '18K Warm Gold' },
      { label: 'Gemstone Weight', value: '1.20 Carat' },
      { label: 'Clarity', value: 'VVS1' }
    ]
  },
  {
    id: 2,
    name: 'Royal Heritage Gold Choker',
    slug: 'royal-heritage-gold-choker',
    category: 'Necklaces',
    price: 89000,
    compareAtPrice: 95000,
    badge: 'NEW',
    metalType: '18K Solid Gold',
    gemstone: 'None',
    inStock: true,
    stockQuantity: 6,
    description: 'Inspired by classical royal heritage, this hand-engraved 18K solid gold choker features intricate filigree craftsmanship.',
    materials: '18K Warm Gold, Filigree Wire Work',
    careGuide: 'Avoid contact with perfumes and harsh household chemicals.',
    shippingInfo: 'Complimentary insured express delivery.',
    image: '/assets/images/slideshow-girl-necklace.jpg',
    images: ['/assets/images/slideshow-girl-necklace.jpg', '/assets/images/slideshow-ref-1.jpg'],
    specifications: [
      { label: 'Metal', value: '18K Yellow Gold' },
      { label: 'Weight', value: '28.5 Grams' }
    ]
  },
  {
    id: 3,
    name: 'Celestial Pearl Drop Earrings',
    slug: 'celestial-pearl-drop-earrings',
    category: 'Earrings',
    price: 24500,
    compareAtPrice: 28000,
    badge: 'SALE',
    metalType: 'Sterling Silver',
    gemstone: 'Freshwater Pearl & Diamond',
    inStock: true,
    stockQuantity: 15,
    description: 'Luminous Grade-AAA Japanese Akoya freshwater pearls suspended beneath sparkling star-set brilliant diamond studs.',
    materials: 'Grade AAA Akoya Pearl, Sterling Silver 925',
    careGuide: 'Pearls love natural oils. Put on after cosmetics application.',
    shippingInfo: 'Complimentary insured express delivery.',
    image: '/assets/images/slideshow-earrings.jpg',
    images: ['/assets/images/slideshow-earrings.jpg', '/assets/images/slideshow-1.jpg'],
    specifications: [
      { label: 'Metal', value: 'Sterling Silver 925' },
      { label: 'Pearl Type', value: 'Natural Akoya Pearl 9mm' }
    ]
  },
  {
    id: 4,
    name: 'Classic Diamond Cuff Bracelet',
    slug: 'classic-diamond-cuff-bracelet',
    category: 'Bracelets',
    price: 62000,
    compareAtPrice: 68000,
    badge: 'BESTSELLER',
    metalType: '18K Warm Gold',
    gemstone: 'Diamond (0.45 ct)',
    inStock: true,
    stockQuantity: 8,
    description: 'A sleek open-cuff bracelet featuring twin brilliant diamond solitaire terminals set in warm gold.',
    materials: '18K Warm Gold, Brilliant Diamonds',
    careGuide: 'Wipe down gently after wearing with included polishing cloth.',
    shippingInfo: 'Complimentary insured express delivery.',
    image: '/assets/images/slideshow-bangles.jpg',
    images: ['/assets/images/slideshow-bangles.jpg', '/assets/images/slideshow-2.jpg'],
    specifications: [
      { label: 'Metal', value: '18K Warm Gold' },
      { label: 'Inner Circumference', value: '6.5 Inches' }
    ]
  }
];

export function getDefaultPlaceholder(nameOrCategory?: string): string {
  if (!nameOrCategory) return '/assets/images/placeholder-jewellery.svg';
  const s = nameOrCategory.toLowerCase();
  if (s.includes('ring')) return '/assets/images/placeholder-rings.svg';
  if (s.includes('necklace') || s.includes('pendant') || s.includes('choker')) return '/assets/images/placeholder-necklaces.svg';
  if (s.includes('earring') || s.includes('stud') || s.includes('hoop')) return '/assets/images/placeholder-earrings.svg';
  if (s.includes('bracelet') || s.includes('bangle') || s.includes('cuff')) return '/assets/images/placeholder-bracelets.svg';
  return '/assets/images/placeholder-jewellery.svg';
}

export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, sort, search } = req.query;

    try {
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

      const [rows] = await pool.query(query, queryParams);
      if (Array.isArray(rows) && rows.length > 0) {
        const mappedRows = rows.map((row: any) => ({
          ...row,
          image: row.image && row.image.trim() !== '' ? row.image : getDefaultPlaceholder(row.category_name || row.name)
        }));
        return res.status(200).json({ success: true, count: mappedRows.length, data: mappedRows });
      }
    } catch (dbErr) {
      // Fallback to local memory products if DB connection fails
    }

    let filtered = [...fallbackProducts];
    if (category && category !== 'all') {
      filtered = filtered.filter(p => p.category.toLowerCase() === String(category).toLowerCase());
    }
    if (search) {
      filtered = filtered.filter(p => p.name.toLowerCase().includes(String(search).toLowerCase()));
    }
    if (sort === 'price-low') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sort === 'price-high') {
      filtered.sort((a, b) => b.price - a.price);
    }

    return res.status(200).json({ success: true, count: filtered.length, data: filtered });
  } catch (err) {
    next(err);
  }
};

export const getProductBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;

    try {
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

        return res.status(200).json({
          success: true,
          data: {
            ...product,
            image: finalImage,
            images: imgs.length > 0 ? imgs.map((i: any) => i.image_url) : [finalImage],
            specifications: specs
          }
        });
      }
    } catch (dbErr) {
      // Fallback if DB connection fails
    }

    const found = fallbackProducts.find(p => p.slug === slug) || fallbackProducts[0];
    return res.status(200).json({ success: true, data: found });
  } catch (err) {
    next(err);
  }
};

export const getCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    try {
      const [rows]: any = await pool.query(`SELECT * FROM categories ORDER BY id ASC`);
      if (rows && rows.length > 0) {
        const mappedCats = rows.map((c: any) => ({
          ...c,
          image: c.image && c.image.trim() !== '' ? c.image : getDefaultPlaceholder(c.slug || c.name)
        }));
        return res.status(200).json({ success: true, count: mappedCats.length, data: mappedCats });
      }
    } catch (dbErr) {
      // Fallback
    }

    return res.status(200).json({ success: true, count: fallbackCategories.length, data: fallbackCategories });
  } catch (err) {
    next(err);
  }
};
