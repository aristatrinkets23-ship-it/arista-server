import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { logger } from '../utils/logger';

dotenv.config();

const useSsl =
  process.env.DB_SSL === 'true' ||
  Boolean(process.env.DB_HOST?.includes('aivencloud.com')) ||
  Boolean(process.env.DATABASE_URL?.includes('aivencloud.com')) ||
  Boolean(process.env.DATABASE_URL?.includes('ssl-mode=REQUIRED')) ||
  (process.env.NODE_ENV === 'production' &&
    Boolean(process.env.DB_HOST) &&
    !['localhost', '127.0.0.1'].includes(process.env.DB_HOST || ''));

const isServerless =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  process.env.NODE_ENV === 'production';

const defaultConnectionLimit = isServerless ? 2 : 10;
const configuredLimit = process.env.DB_CONNECTION_LIMIT ? Number(process.env.DB_CONNECTION_LIMIT) : defaultConnectionLimit;

const poolConfig: mysql.PoolOptions = process.env.DATABASE_URL
  ? {
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: configuredLimit,
      maxIdle: isServerless ? 1 : 5,
      idleTimeout: 20000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      timezone: 'Z',
      ssl: useSsl ? { rejectUnauthorized: false } : undefined
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'defaultdb',
      waitForConnections: true,
      connectionLimit: configuredLimit,
      maxIdle: isServerless ? 1 : 5,
      idleTimeout: 20000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      timezone: 'Z',
      ssl: useSsl ? { rejectUnauthorized: false } : undefined
    };

export const pool = mysql.createPool(poolConfig);

// Enforce UTC (+00:00) session timezone on all database connections
pool.on('connection', (conn: any) => {
  conn.query("SET time_zone = '+00:00'", (err: any) => {
    if (err) {
      logger.warn(`Failed to set session timezone to UTC: ${err.message}`);
    }
  });
});

/**
 * Automatically creates tables if not exists and seeds default admin credentials
 */
export const ensureTablesExist = async (connection: mysql.PoolConnection): Promise<void> => {
  try {
    // 1. Create users table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(100) NOT NULL,
        \`email\` VARCHAR(150) NOT NULL UNIQUE,
        \`password\` VARCHAR(255) NOT NULL,
        \`phone\` VARCHAR(20) DEFAULT NULL,
        \`role\` ENUM('CUSTOMER', 'ADMIN', 'SUPER_ADMIN') NOT NULL DEFAULT 'CUSTOMER',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_user_role\` (\`role\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Seed default admin credentials into users table if not exists
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@aristatrinkets.com';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

    const [adminRows]: any = await connection.query(`SELECT id FROM users WHERE email = ?`, [adminEmail]);
    if (!adminRows || adminRows.length === 0) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await connection.query(
        `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'SUPER_ADMIN')`,
        ['Arista Trinkets Administrator', adminEmail, hashedPassword]
      );
      logger.info(`Default Admin credentials seeded into MySQL database (${adminEmail}).`);
    }

    // 3. Create categories table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`categories\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(100) NOT NULL,
        \`slug\` VARCHAR(100) NOT NULL UNIQUE,
        \`description\` TEXT DEFAULT NULL,
        \`image\` LONGTEXT DEFAULT NULL,
        \`item_count\` INT NOT NULL DEFAULT 0,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Create products table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`products\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`category_id\` INT DEFAULT NULL,
        \`name\` VARCHAR(150) NOT NULL,
        \`slug\` VARCHAR(150) NOT NULL UNIQUE,
        \`price\` DECIMAL(10, 2) NOT NULL,
        \`compare_at_price\` DECIMAL(10, 2) DEFAULT NULL,
        \`badge\` VARCHAR(50) DEFAULT NULL,
        \`metal_type\` VARCHAR(100) DEFAULT NULL,
        \`gemstone\` VARCHAR(100) DEFAULT NULL,
        \`in_stock\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`stock_quantity\` INT NOT NULL DEFAULT 10,
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`description\` TEXT DEFAULT NULL,
        \`materials\` TEXT DEFAULT NULL,
        \`care_guide\` TEXT DEFAULT NULL,
        \`shipping_info\` TEXT DEFAULT NULL,
        \`image\` LONGTEXT NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`category_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE SET NULL,
        INDEX \`idx_product_price\` (\`price\`),
        INDEX \`idx_product_stock\` (\`in_stock\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await connection.query(`ALTER TABLE \`products\` ADD COLUMN \`is_active\` TINYINT(1) NOT NULL DEFAULT 1`);
    } catch (e) {}

    // 5. Create product_images table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`product_images\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`product_id\` INT NOT NULL,
        \`image_url\` LONGTEXT NOT NULL,
        \`sort_order\` INT DEFAULT 0,
        FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Create product_specifications table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`product_specifications\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`product_id\` INT NOT NULL,
        \`spec_label\` VARCHAR(100) NOT NULL,
        \`spec_value\` VARCHAR(255) NOT NULL,
        FOREIGN KEY (\`product_id\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Create homepage_config table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`homepage_config\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`section_key\` VARCHAR(100) NOT NULL UNIQUE,
        \`section_label\` VARCHAR(150) NOT NULL,
        \`image\` LONGTEXT DEFAULT NULL,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      INSERT IGNORE INTO \`homepage_config\` (\`section_key\`, \`section_label\`, \`image\`) VALUES
      ('editorial_photo', 'Artisanal Excellence Photo', '/assets/images/editorial-artisanal-craft.webp');
    `);

    // 8. Create wishlist_items table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`wishlist_items\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT DEFAULT NULL,
        \`session_id\` VARCHAR(100) DEFAULT NULL,
        \`product_id\` INT DEFAULT NULL,
        \`slug\` VARCHAR(150) NOT NULL,
        \`product_data\` JSON DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_wishlist_user\` (\`user_id\`),
        INDEX \`idx_wishlist_session\` (\`session_id\`),
        INDEX \`idx_wishlist_slug\` (\`slug\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 9. Create cart_items table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`cart_items\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT DEFAULT NULL,
        \`session_id\` VARCHAR(100) DEFAULT NULL,
        \`product_id\` INT DEFAULT NULL,
        \`slug\` VARCHAR(150) DEFAULT NULL,
        \`product_data\` JSON DEFAULT NULL,
        \`metal_type\` VARCHAR(100) DEFAULT NULL,
        \`quantity\` INT NOT NULL DEFAULT 1,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_cart_user\` (\`user_id\`),
        INDEX \`idx_cart_session\` (\`session_id\`),
        INDEX \`idx_cart_slug\` (\`slug\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 10. Create orders table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`orders\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`order_number\` VARCHAR(50) NOT NULL UNIQUE,
        \`invoice_number\` VARCHAR(50) UNIQUE DEFAULT NULL,
        \`tracking_code\` VARCHAR(20) UNIQUE DEFAULT NULL,
        \`user_id\` INT DEFAULT NULL,
        \`customer_name\` VARCHAR(100) NOT NULL,
        \`customer_email\` VARCHAR(150) NOT NULL,
        \`customer_phone\` VARCHAR(20) NOT NULL,
        \`shipping_address\` TEXT NOT NULL,
        \`city\` VARCHAR(100) NOT NULL,
        \`state\` VARCHAR(100) NOT NULL,
        \`pincode\` VARCHAR(20) NOT NULL,
        \`subtotal\` DECIMAL(10, 2) NOT NULL,
        \`shipping_fee\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        \`tax\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        \`total_amount\` DECIMAL(10, 2) NOT NULL,
        \`payment_method\` ENUM('RAZORPAY', 'UPI', 'CARD', 'NETBANKING', 'COD') NOT NULL DEFAULT 'RAZORPAY',
        \`payment_status\` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
        \`razorpay_order_id\` VARCHAR(100) DEFAULT NULL,
        \`razorpay_payment_id\` VARCHAR(100) DEFAULT NULL,
        \`razorpay_signature\` VARCHAR(255) DEFAULT NULL,
        \`paid_at\` TIMESTAMP NULL DEFAULT NULL,
        \`order_status\` ENUM('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
        \`processing_at\` TIMESTAMP NULL DEFAULT NULL,
        \`shipped_at\` TIMESTAMP NULL DEFAULT NULL,
        \`delivered_at\` TIMESTAMP NULL DEFAULT NULL,
        \`cancelled_at\` TIMESTAMP NULL DEFAULT NULL,
        \`cancellation_reason\` VARCHAR(255) DEFAULT NULL,
        \`cancelled_by\` VARCHAR(50) DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_order_status\` (\`order_status\`),
        INDEX \`idx_order_user\` (\`user_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 11. Create order_items table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`order_items\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`order_id\` INT NOT NULL,
        \`product_id\` INT DEFAULT NULL,
        \`product_name\` VARCHAR(150) NOT NULL,
        \`unit_price\` DECIMAL(10, 2) NOT NULL,
        \`metal_type\` VARCHAR(100) DEFAULT NULL,
        \`quantity\` INT NOT NULL DEFAULT 1,
        \`total_price\` DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 12. Create enquiries table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`enquiries\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(100) NOT NULL,
        \`email\` VARCHAR(150) NOT NULL,
        \`phone\` VARCHAR(20) DEFAULT NULL,
        \`subject\` VARCHAR(200) DEFAULT NULL,
        \`message\` TEXT NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_enquiries_email\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 13. Create password_resets table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`password_resets\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`email\` VARCHAR(150) NOT NULL,
        \`otp\` VARCHAR(6) NOT NULL,
        \`expires_at\` DATETIME NOT NULL,
        \`used\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_pwreset_email\` (\`email\`),
        INDEX \`idx_pwreset_otp\` (\`otp\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 14. Create user_addresses table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`user_addresses\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` INT DEFAULT NULL,
        \`user_email\` VARCHAR(150) NOT NULL,
        \`full_name\` VARCHAR(100) NOT NULL,
        \`phone\` VARCHAR(20) NOT NULL,
        \`address_line\` TEXT NOT NULL,
        \`city\` VARCHAR(100) NOT NULL,
        \`state\` VARCHAR(100) NOT NULL,
        \`pincode\` VARCHAR(20) NOT NULL,
        \`is_default\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_addr_user_id\` (\`user_id\`),
        INDEX \`idx_addr_email\` (\`user_email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 15. Create store_settings table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`store_settings\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`setting_key\` VARCHAR(100) NOT NULL UNIQUE,
        \`setting_value\` TEXT DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed default store settings if not exist
    const defaultSettings: [string, string][] = [
      ['gst_number', '24AAACA1234A1Z5'],
      ['gst_percentage', '3.0'],
      ['delivery_charge', '50.00'],
      ['free_delivery_threshold', '600.00'],
      ['company_name', 'Arista Trinkets'],
      ['company_address', 'Studio 101, Jewel Arcade, Near City Centre, Vadodara, Gujarat - 390001'],
      ['company_phone', '9016134899'],
      ['company_email', 'info@aristatrinkets.com'],
      ['company_timing', 'Mon – Sat: 10:00 AM – 7:00 PM IST'],
      ['invoice_prefix', 'INV-']
    ];

    for (const [key, val] of defaultSettings) {
      await connection.query(
        `INSERT IGNORE INTO \`store_settings\` (\`setting_key\`, \`setting_value\`) VALUES (?, ?)`,
        [key, val]
      );
    }

    // 16. Create newsletter_subscribers table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`newsletter_subscribers\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`email\` VARCHAR(150) NOT NULL UNIQUE,
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`subscribed_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`unsubscribed_at\` TIMESTAMP NULL DEFAULT NULL,
        INDEX \`idx_newsletter_active\` (\`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 17. Comprehensive Auto-Migration Block for Existing Production Databases
    // Modifies/Adds any newly introduced columns safely if they do not exist in the database

    // Products table migrations
    try { await connection.query(`ALTER TABLE \`products\` MODIFY COLUMN \`image\` LONGTEXT NOT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`products\` ADD COLUMN \`is_active\` TINYINT(1) NOT NULL DEFAULT 1;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`products\` ADD COLUMN \`stock_quantity\` INT NOT NULL DEFAULT 10;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`products\` ADD COLUMN \`compare_at_price\` DECIMAL(10, 2) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`products\` ADD COLUMN \`badge\` VARCHAR(50) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`products\` ADD COLUMN \`metal_type\` VARCHAR(100) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`products\` ADD COLUMN \`gemstone\` VARCHAR(100) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`products\` ADD COLUMN \`materials\` TEXT DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`products\` ADD COLUMN \`care_guide\` TEXT DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`products\` ADD COLUMN \`shipping_info\` TEXT DEFAULT NULL;`); } catch (e) { }

    // Categories table migrations
    try { await connection.query(`ALTER TABLE \`categories\` MODIFY COLUMN \`image\` LONGTEXT DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`categories\` ADD COLUMN \`item_count\` INT NOT NULL DEFAULT 0;`); } catch (e) { }

    // Product Images & Specifications migrations
    try { await connection.query(`ALTER TABLE \`product_images\` MODIFY COLUMN \`image_url\` LONGTEXT NOT NULL;`); } catch (e) { }

    // Cart & Wishlist items migrations
    try { await connection.query(`ALTER TABLE \`cart_items\` MODIFY COLUMN \`product_id\` INT DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`cart_items\` ADD COLUMN \`metal_type\` VARCHAR(100) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`cart_items\` ADD COLUMN \`slug\` VARCHAR(150) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`cart_items\` ADD COLUMN \`product_data\` JSON DEFAULT NULL;`); } catch (e) { }

    try { await connection.query(`ALTER TABLE \`wishlist_items\` ADD COLUMN \`session_id\` VARCHAR(100) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`wishlist_items\` ADD COLUMN \`product_data\` JSON DEFAULT NULL;`); } catch (e) { }

    // Orders table migrations - Safe & independent, no cascading failures
    try { await connection.query(`ALTER TABLE \`orders\` ADD COLUMN \`tracking_code\` VARCHAR(50) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`orders\` ADD COLUMN \`invoice_number\` VARCHAR(50) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`orders\` ADD COLUMN \`courier_name\` VARCHAR(100) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`orders\` ADD COLUMN \`processing_at\` TIMESTAMP NULL DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`orders\` ADD COLUMN \`shipped_at\` TIMESTAMP NULL DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`orders\` ADD COLUMN \`delivered_at\` TIMESTAMP NULL DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`orders\` ADD COLUMN \`cancelled_at\` TIMESTAMP NULL DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`orders\` ADD COLUMN \`cancellation_reason\` VARCHAR(255) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`orders\` ADD COLUMN \`cancelled_by\` VARCHAR(50) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`orders\` MODIFY COLUMN \`order_status\` ENUM('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'PENDING';`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`orders\` ADD COLUMN \`razorpay_signature\` VARCHAR(255) DEFAULT NULL;`); } catch (e) { }
    try { await connection.query(`ALTER TABLE \`orders\` ADD COLUMN \`paid_at\` TIMESTAMP NULL DEFAULT NULL;`); } catch (e) { }

    // Safe cleanup of redundant secondary indexes that duplicate UNIQUE constraints (saves TiDB storage & index cache)
    const redundantIndexes: [string, string][] = [
      ['users', 'idx_user_email'],
      ['categories', 'idx_category_slug'],
      ['products', 'idx_product_slug'],
      ['orders', 'idx_order_number'],
      ['orders', 'idx_tracking_code'],
      ['orders', 'idx_invoice_number'],
      ['store_settings', 'idx_setting_key'],
      ['newsletter_subscribers', 'idx_newsletter_email']
    ];
    for (const [table, idx] of redundantIndexes) {
      try {
        await connection.query(`ALTER TABLE \`${table}\` DROP INDEX \`${idx}\`;`);
      } catch (e) { }
    }

    // Backfill invoice_number for past orders if null
    try {
      const [ordersWithoutInvoice]: any = await connection.query(
        `SELECT id, order_number, created_at FROM \`orders\` WHERE \`invoice_number\` IS NULL`
      );
      if (ordersWithoutInvoice && ordersWithoutInvoice.length > 0) {
        for (const ord of ordersWithoutInvoice) {
          const year = ord.created_at ? new Date(ord.created_at).getFullYear() : new Date().getFullYear();
          const cleanNum = String(ord.order_number || ord.id).replace(/\D/g, '').padStart(6, '0');
          const invNum = `INV-${year}-${cleanNum}`;
          try {
            await connection.query(`UPDATE \`orders\` SET \`invoice_number\` = ? WHERE \`id\` = ?`, [invNum, ord.id]);
          } catch (invErr) { }
        }
      }
    } catch (e) { }

    // User Addresses migrations
    try { await connection.query(`ALTER TABLE \`user_addresses\` ADD COLUMN \`is_default\` BOOLEAN NOT NULL DEFAULT FALSE;`); } catch (e) { }

    // Auto-Sanitize deprecated/dead Unsplash image URLs to local assets
    try {
      await connection.query(
        "UPDATE `categories` SET `image` = '/assets/images/occasion-festive.webp' WHERE `image` LIKE '%1611591475140%' OR `image` LIKE '%be38b794ff8d%'"
      );
      await connection.query(
        "UPDATE `products` SET `image` = '/assets/images/occasion-festive.webp' WHERE `image` LIKE '%1611591475140%' OR `image` LIKE '%be38b794ff8d%'"
      );
      await connection.query(
        "UPDATE `product_images` SET `image_url` = '/assets/images/occasion-festive.webp' WHERE `image_url` LIKE '%1611591475140%' OR `image_url` LIKE '%be38b794ff8d%'"
      );
    } catch (e) { }

    // Run ephemeral storage pruning on table verification
    await pruneExpiredDatabaseRecords(connection);
  } catch (err: any) {
    logger.warn(`Table creation check warning: ${err.message}`);
  }
};

/**
 * Prunes expired ephemeral data to conserve storage (e.g. TiDB 5GB limit)
 */
export const pruneExpiredDatabaseRecords = async (conn?: mysql.PoolConnection): Promise<void> => {
  let connection = conn;
  let shouldRelease = false;
  try {
    if (!connection) {
      connection = await pool.getConnection();
      shouldRelease = true;
    }

    // 1. Delete expired OTP / password reset tokens
    const [resetsResult]: any = await connection.query(`DELETE FROM \`password_resets\` WHERE \`expires_at\` < NOW()`);
    if (resetsResult?.affectedRows > 0) {
      logger.info(`Pruned ${resetsResult.affectedRows} expired password reset records.`);
    }

    // 2. Delete abandoned guest carts older than 30 days
    const [cartsResult]: any = await connection.query(
      `DELETE FROM \`cart_items\` WHERE \`user_id\` IS NULL AND \`created_at\` < DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );
    if (cartsResult?.affectedRows > 0) {
      logger.info(`Pruned ${cartsResult.affectedRows} abandoned guest cart items.`);
    }
  } catch (err: any) {
    logger.warn(`Storage maintenance pruning warning: ${err.message}`);
  } finally {
    if (shouldRelease && connection) {
      connection.release();
    }
  }
};

let hasCheckedDb = false;

export const checkDatabaseConnection = async (): Promise<boolean> => {
  if (hasCheckedDb) return true;
  let connection: mysql.PoolConnection | null = null;
  try {
    connection = await pool.getConnection();
    logger.info('Successfully connected to MySQL database pool.');
    // Fast check: verify if schema exists to avoid running 25+ DDL queries on every cold start
    const [tables]: any = await connection.query("SHOW TABLES LIKE 'products'");
    if (Array.isArray(tables) && tables.length > 0 && process.env.FORCE_DB_MIGRATION !== 'true') {
      logger.info('Database schema verified. Skipping redundant startup table checks.');
    } else {
      logger.info('Schema not detected or forced. Ensuring database tables exist...');
      await ensureTablesExist(connection);
    }
    hasCheckedDb = true;
    return true;
  } catch (err: any) {
    logger.error(`Database connection failed: ${err.message}`);
    return false;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
