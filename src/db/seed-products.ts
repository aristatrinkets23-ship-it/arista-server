import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { ensureTablesExist } from '../config/database';

dotenv.config();

interface SeedCategory {
  name: string;
  slug: string;
  description: string;
  image: string;
}

interface SeedProduct {
  categorySlug: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number;
  badge?: string;
  metalType: string;
  gemstone?: string;
  inStock: boolean;
  stockQuantity: number;
  description: string;
  materials: string;
  careGuide: string;
  shippingInfo: string;
  image: string;
  galleryImages: string[];
  specifications: { label: string; value: string }[];
}

const categoriesData: SeedCategory[] = [
  {
    name: 'Rings',
    slug: 'rings',
    description: 'Solitaire, eternity bands, and handcrafted luxury statement rings in 18K gold and platinum.',
    image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Necklaces & Pendants',
    slug: 'necklaces',
    description: 'Timeless pendants, gold chains, and regal gemstone chokers designed for effortless elegance.',
    image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Earrings',
    slug: 'earrings',
    description: 'Diamond studs, South Sea pearl drops, and contemporary gold hoops for every occasion.',
    image: 'https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=800&q=80'
  },
  {
    name: 'Bracelets & Bangles',
    slug: 'bracelets',
    description: 'Classic tennis bracelets, stacked gold bangles, and artisanal cuffs.',
    image: '/assets/images/occasion-festive.webp'
  }
];

const productsData: SeedProduct[] = [
  // --- RINGS ---
  {
    categorySlug: 'rings',
    name: 'Celestial Solitaire Diamond Ring',
    slug: 'celestial-solitaire-diamond-ring',
    price: 28500,
    compareAtPrice: 34000,
    badge: 'BESTSELLER',
    metalType: '18K Warm Gold',
    gemstone: 'Solitaire Diamond (VVS1)',
    inStock: true,
    stockQuantity: 15,
    description: 'A breathtaking 18K warm gold solitaire ring featuring a brilliant 0.50-carat VVS1 diamond held in a refined 4-prong setting. Designed to capture light from every angle.',
    materials: '18K Warm Gold (750 Hallmarked), Conflict-Free VVS1 Diamond',
    careGuide: 'Clean gently with mild warm soapy water and a soft-bristled brush. Store individually in your velvet Arista box.',
    shippingInfo: 'Insured express shipping in 2-4 business days. Includes Certificate of Authenticity.',
    image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1602751584552-8ba73aad10e1?auto=format&fit=crop&w=900&q=80'
    ],
    specifications: [
      { label: 'Metal Purity', value: '18K Warm Gold (750)' },
      { label: 'Diamond Carat Weight', value: '0.50 ct' },
      { label: 'Diamond Clarity', value: 'VVS1 / Color E' },
      { label: 'Certification', value: 'IGI & BIS Hallmarked' }
    ]
  },
  {
    categorySlug: 'rings',
    name: 'Aura Emerald Cut Eternity Band',
    slug: 'aura-emerald-cut-eternity-band',
    price: 19800,
    compareAtPrice: 24000,
    badge: 'TRENDING',
    metalType: '18K Rose Gold',
    gemstone: 'Colombian Emerald & Diamonds',
    inStock: true,
    stockQuantity: 8,
    description: 'An exquisite eternity ring featuring alternating emerald-cut Colombian emeralds and pavé-set round brilliant diamonds in 18K rose gold.',
    materials: '18K Rose Gold, Natural Colombian Emeralds, Natural Diamonds',
    careGuide: 'Avoid direct exposure to harsh household chemicals, perfumes, or thermal shocks.',
    shippingInfo: 'Complimentary insured courier delivery with gift wrapping.',
    image: 'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1603561591411-07134e71a2a9?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80'
    ],
    specifications: [
      { label: 'Metal', value: '18K Rose Gold' },
      { label: 'Gemstone Weight', value: '1.20 ct Total' },
      { label: 'Band Width', value: '3.2 mm' },
      { label: 'Hallmark', value: 'BIS 750 Stamped' }
    ]
  },
  {
    categorySlug: 'rings',
    name: 'Imperial Royal Sapphire Ring',
    slug: 'imperial-royal-sapphire-ring',
    price: 32000,
    compareAtPrice: 38500,
    badge: 'EXCLUSIVE',
    metalType: 'Platinum 950',
    gemstone: 'Ceylon Royal Blue Sapphire',
    inStock: true,
    stockQuantity: 5,
    description: 'A masterpiece of royal heritage. A deep Ceylon blue oval sapphire framed by a halo of micro-pave diamonds in pure Platinum 950.',
    materials: 'Platinum 950, Natural Ceylon Sapphire, VS Diamonds',
    careGuide: 'Store separately. Professional ultrasonic cleaning recommended annually.',
    shippingInfo: 'Delivered in a handcrafted wooden Arista Atelier vault case.',
    image: 'https://images.unsplash.com/photo-1602751584552-8ba73aad10e1?auto=format&fit=crop&w=900&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1602751584552-8ba73aad10e1?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=900&q=80'
    ],
    specifications: [
      { label: 'Metal', value: 'Platinum 950' },
      { label: 'Center Stone', value: 'Ceylon Blue Sapphire (1.8 ct)' },
      { label: 'Halo Stones', value: '32 Brilliant Diamonds' },
      { label: 'Certification', value: 'GIA Certified' }
    ]
  },

  // --- NECKLACES ---
  {
    categorySlug: 'necklaces',
    name: 'Elysian Pearl & Diamond Pendant',
    slug: 'elysian-pearl-diamond-pendant',
    price: 14500,
    compareAtPrice: 18000,
    badge: 'BESTSELLER',
    metalType: '18K Warm Gold',
    gemstone: 'South Sea Pearl',
    inStock: true,
    stockQuantity: 12,
    description: 'A lustrous 10mm South Sea pearl suspended from an intricate 18K warm gold motif encrusted with round accent diamonds. Includes an 18-inch adjustable chain.',
    materials: '18K Warm Gold, Natural South Sea Pearl, Round Diamonds',
    careGuide: 'Pearls are organic. Put on your pearl jewellery after applying cosmetics, hairspray, and perfume.',
    shippingInfo: 'Ships within 48 hours. Includes velvet presentation box.',
    image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=900&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=900&q=80',
      '/assets/images/occasion-festive.webp'
    ],
    specifications: [
      { label: 'Metal', value: '18K Warm Gold' },
      { label: 'Pearl Size', value: '10 mm South Sea' },
      { label: 'Chain Length', value: '18 inches (Adjustable)' },
      { label: 'Clasp Type', value: 'Lobster Claw Clasp' }
    ]
  },
  {
    categorySlug: 'necklaces',
    name: 'Linked Venetian Gold Chain',
    slug: 'linked-venetian-gold-chain',
    price: 12800,
    compareAtPrice: 15000,
    badge: 'NEW',
    metalType: '18K Warm Gold',
    gemstone: 'Pure Gold',
    inStock: true,
    stockQuantity: 20,
    description: 'Interlocking 18K warm gold oval links hand-polished to a high mirror sheen. A versatile luxury staple worn solo or layered.',
    materials: 'Solid 18K Warm Gold (750)',
    careGuide: 'Polishing cloth included. Safe for daily wear.',
    shippingInfo: 'Express delivery with tracking code.',
    image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=900&q=80'
    ],
    specifications: [
      { label: 'Material', value: 'Solid 18K Gold' },
      { label: 'Link Width', value: '4.5 mm' },
      { label: 'Weight', value: '8.4 grams' },
      { label: 'Stamp', value: 'BIS 750 Hallmarked' }
    ]
  },
  {
    categorySlug: 'necklaces',
    name: 'Artisan Emerald Choker Necklace',
    slug: 'artisan-emerald-choker-necklace',
    price: 42000,
    compareAtPrice: 48000,
    badge: 'EXCLUSIVE',
    metalType: '18K Yellow Gold',
    gemstone: 'Zambian Emerald & Diamonds',
    inStock: true,
    stockQuantity: 4,
    description: 'A showstopping statement choker adorned with 5 pear-cut Zambian emeralds flanked by brilliant baguette-cut diamonds.',
    materials: '18K Yellow Gold, Natural Emeralds, Baguette Diamonds',
    careGuide: 'Handle with extreme care. Keep away from water and oil.',
    shippingInfo: 'White-glove courier delivery with security seal.',
    image: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=900&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=900&q=80'
    ],
    specifications: [
      { label: 'Metal', value: '18K Yellow Gold' },
      { label: 'Total Emerald Carat', value: '3.50 ct' },
      { label: 'Diamond Carat', value: '1.80 ct' },
      { label: 'Necklace Length', value: '16 - 18 inches' }
    ]
  },

  // --- EARRINGS ---
  {
    categorySlug: 'earrings',
    name: 'Estelle Pavé Diamond Gold Hoops',
    slug: 'estelle-pave-diamond-gold-hoops',
    price: 8900,
    compareAtPrice: 11500,
    badge: 'TRENDING',
    metalType: '18K Yellow Gold',
    gemstone: 'Pavé Diamonds',
    inStock: true,
    stockQuantity: 18,
    description: 'Elegant 18K yellow gold huggie hoops encrusted with micro pavé diamonds along the outer curve for luminous shimmer.',
    materials: '18K Yellow Gold, Round Diamonds',
    careGuide: 'Wipe with micro-fiber cloth after use.',
    shippingInfo: 'Standard 2-3 day shipping.',
    image: 'https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=900&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=80'
    ],
    specifications: [
      { label: 'Metal', value: '18K Yellow Gold' },
      { label: 'Hoop Diameter', value: '15 mm' },
      { label: 'Closure', value: 'Snap Back Catch' },
      { label: 'Diamond Weight', value: '0.35 ct Total' }
    ]
  },
  {
    categorySlug: 'earrings',
    name: 'Solstice Pearl Drop Earrings',
    slug: 'solstice-pearl-drop-earrings',
    price: 6500,
    badge: 'NEW',
    metalType: 'Sterling Silver 925',
    gemstone: 'Baroque Pearl',
    inStock: true,
    stockQuantity: 15,
    description: 'Irregular natural baroque pearls suspended from textured sterling silver french wires. Every pair is uniquely one-of-a-kind.',
    materials: 'Sterling Silver 925, Natural Freshwater Baroque Pearls',
    careGuide: 'Keep away from moisture and direct sunlight.',
    shippingInfo: 'Ships in Arista eco-luxury pouch.',
    image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=900&q=80'
    ],
    specifications: [
      { label: 'Metal', value: '925 Sterling Silver' },
      { label: 'Pearl Type', value: 'Freshwater Baroque' },
      { label: 'Drop Length', value: '32 mm' },
      { label: 'Earring Post', value: 'French Hook' }
    ]
  },

  // --- BRACELETS ---
  {
    categorySlug: 'bracelets',
    name: 'Amora Diamond Tennis Bracelet',
    slug: 'amora-diamond-tennis-bracelet',
    price: 38000,
    compareAtPrice: 45000,
    badge: 'BESTSELLER',
    metalType: '18K White Gold',
    gemstone: 'Round Diamonds (2.0 ct)',
    inStock: true,
    stockQuantity: 7,
    description: 'A seamless line of 52 matching round brilliant diamonds set in liquid-smooth 18K white gold. Secured with a double-safety lock.',
    materials: '18K White Gold, 52 Round Diamonds',
    careGuide: 'Professional annual check for clasp tension recommended.',
    shippingInfo: 'Insured priority courier delivery.',
    image: '/assets/images/occasion-festive.webp',
    galleryImages: [
      '/assets/images/occasion-festive.webp',
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=80'
    ],
    specifications: [
      { label: 'Metal', value: '18K White Gold' },
      { label: 'Diamond Carat', value: '2.00 ct Total' },
      { label: 'Bracelet Length', value: '7.0 inches' },
      { label: 'Clasp', value: 'Double Safety Push Latch' }
    ]
  },
  {
    categorySlug: 'bracelets',
    name: 'Knot of Love Bangle Set',
    slug: 'knot-of-love-bangle-set',
    price: 16400,
    badge: 'NEW',
    metalType: '18K Rose Gold',
    gemstone: 'Cubic Zirconia Accents',
    inStock: true,
    stockQuantity: 14,
    description: 'A set of three stackable 18K rose gold bangles tied together with a sparkling pavé knot motif symbolizing everlasting bonds.',
    materials: '18K Rose Gold Plated Silver, Cubic Zirconia',
    careGuide: 'Avoid contact with harsh detergents and pool water.',
    shippingInfo: 'Arista gift box included.',
    image: 'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=900&q=80',
    galleryImages: [
      'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=900&q=80',
      '/assets/images/occasion-festive.webp'
    ],
    specifications: [
      { label: 'Metal Finish', value: '18K Rose Gold' },
      { label: 'Quantity', value: 'Set of 3 Stackable Bangles' },
      { label: 'Inner Diameter', value: '62 mm' },
      { label: 'Weight', value: '14.2 grams' }
    ]
  }
];

async function seedDatabase() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'arista_trinkets_db';

  console.log(`\n==================================================`);
  console.log(`💎 SEEDING REAL LUXURY PRODUCTS & CATEGORIES: ${dbName}`);
  console.log(`==================================================\n`);

  const useSsl =
    process.env.DB_SSL === 'true' ||
    host.includes('aivencloud.com') ||
    Boolean(process.env.DATABASE_URL?.includes('aivencloud.com')) ||
    Boolean(process.env.DATABASE_URL?.includes('ssl-mode=REQUIRED')) ||
    (process.env.NODE_ENV === 'production' && !['localhost', '127.0.0.1'].includes(host));

  let connection: mysql.Connection | null = null;
  try {
    const connConfig: mysql.ConnectionOptions = process.env.DATABASE_URL
      ? {
          uri: process.env.DATABASE_URL,
          multipleStatements: true,
          ssl: useSsl ? { rejectUnauthorized: false } : undefined
        }
      : {
          host,
          port,
          user,
          password,
          database: dbName,
          multipleStatements: true,
          ssl: useSsl ? { rejectUnauthorized: false } : undefined
        };

    connection = await mysql.createConnection(connConfig);

    await ensureTablesExist(connection as any);

    // Map to hold category slugs -> category ID
    const categoryMap: Record<string, number> = {};

    console.log(`1. Seeding / Updating Categories...`);
    for (const cat of categoriesData) {
      const [existing]: any = await connection.query(`SELECT id FROM categories WHERE slug = ?`, [cat.slug]);
      let catId: number;
      if (existing && existing.length > 0) {
        catId = existing[0].id;
        await connection.query(
          `UPDATE categories SET name = ?, description = ?, image = ? WHERE id = ?`,
          [cat.name, cat.description, cat.image, catId]
        );
        console.log(`   Updated category: ${cat.name} (ID: ${catId})`);
      } else {
        const [result]: any = await connection.query(
          `INSERT INTO categories (name, slug, description, image, item_count) VALUES (?, ?, ?, ?, 0)`,
          [cat.name, cat.slug, cat.description, cat.image]
        );
        catId = result.insertId;
        console.log(`   Created category: ${cat.name} (ID: ${catId})`);
      }
      categoryMap[cat.slug] = catId;
    }

    console.log(`\n2. Seeding Products, Multi-Images & Specifications...`);
    for (const prod of productsData) {
      const catId = categoryMap[prod.categorySlug] || null;

      const [existingProd]: any = await connection.query(`SELECT id FROM products WHERE slug = ?`, [prod.slug]);
      let prodId: number;

      if (existingProd && existingProd.length > 0) {
        prodId = existingProd[0].id;
        await connection.query(
          `UPDATE products SET category_id = ?, name = ?, price = ?, compare_at_price = ?, badge = ?, metal_type = ?, gemstone = ?, in_stock = ?, stock_quantity = ?, description = ?, materials = ?, care_guide = ?, shipping_info = ?, image = ? WHERE id = ?`,
          [
            catId,
            prod.name,
            prod.price,
            prod.compareAtPrice || null,
            prod.badge || null,
            prod.metalType,
            prod.gemstone || null,
            prod.inStock ? 1 : 0,
            prod.stockQuantity,
            prod.description,
            prod.materials,
            prod.careGuide,
            prod.shippingInfo,
            prod.image,
            prodId
          ]
        );
        console.log(`   Updated product: ${prod.name} (ID: ${prodId})`);
      } else {
        const [result]: any = await connection.query(
          `INSERT INTO products (category_id, name, slug, price, compare_at_price, badge, metal_type, gemstone, in_stock, stock_quantity, description, materials, care_guide, shipping_info, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            catId,
            prod.name,
            prod.slug,
            prod.price,
            prod.compareAtPrice || null,
            prod.badge || null,
            prod.metalType,
            prod.gemstone || null,
            prod.inStock ? 1 : 0,
            prod.stockQuantity,
            prod.description,
            prod.materials,
            prod.careGuide,
            prod.shippingInfo,
            prod.image
          ]
        );
        prodId = result.insertId;
        console.log(`   Created product: ${prod.name} (ID: ${prodId})`);
      }

      // Clear & insert multi-gallery images
      await connection.query(`DELETE FROM product_images WHERE product_id = ?`, [prodId]);
      for (let i = 0; i < prod.galleryImages.length; i++) {
        await connection.query(
          `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)`,
          [prodId, prod.galleryImages[i], i]
        );
      }

      // Clear & insert key-value specifications
      await connection.query(`DELETE FROM product_specifications WHERE product_id = ?`, [prodId]);
      for (const spec of prod.specifications) {
        await connection.query(
          `INSERT INTO product_specifications (product_id, spec_label, spec_value) VALUES (?, ?, ?)`,
          [prodId, spec.label, spec.value]
        );
      }
    }

    // Update item_count in categories
    console.log(`\n3. Updating Category item counts...`);
    for (const [slug, catId] of Object.entries(categoryMap)) {
      const [countRows]: any = await connection.query(
        `SELECT COUNT(*) as cnt FROM products WHERE category_id = ?`,
        [catId]
      );
      const count = countRows[0]?.cnt || 0;
      await connection.query(`UPDATE categories SET item_count = ? WHERE id = ?`, [count, catId]);
    }

    console.log(`\n==================================================`);
    console.log(`✅ Real Luxury Product & Category Data Seeded Cleanly!`);
    console.log(`==================================================\n`);

  } catch (err: any) {
    console.error(`\n❌ Error seeding product data: ${err.message}\n`);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
    process.exit(0);
  }
}

seedDatabase();
