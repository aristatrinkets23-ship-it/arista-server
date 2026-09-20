import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { logger } from '../utils/logger';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'arista_trinkets_db',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
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
        INDEX \`idx_user_email\` (\`email\`),
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
        ['Arista Atelier Administrator', adminEmail, hashedPassword]
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
        \`description\` TEXT DEFAULT NULL,
        \`materials\` TEXT DEFAULT NULL,
        \`care_guide\` TEXT DEFAULT NULL,
        \`shipping_info\` TEXT DEFAULT NULL,
        \`image\` LONGTEXT NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`category_id\`) REFERENCES \`categories\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Alter columns in existing database to support base64 LONGTEXT images
    try {
      await connection.query(`ALTER TABLE \`categories\` MODIFY COLUMN \`image\` LONGTEXT DEFAULT NULL;`);
    } catch (e) {}
    try {
      await connection.query(`ALTER TABLE \`products\` MODIFY COLUMN \`image\` LONGTEXT NOT NULL;`);
    } catch (e) {}
    try {
      await connection.query(`ALTER TABLE \`product_images\` MODIFY COLUMN \`image_url\` LONGTEXT NOT NULL;`);
    } catch (e) {}
  } catch (err: any) {
    logger.warn(`Table creation check warning: ${err.message}`);
  }
};

export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    const connection = await pool.getConnection();
    logger.info('Successfully connected to MySQL database pool.');
    await ensureTablesExist(connection);
    connection.release();
    return true;
  } catch (err: any) {
    logger.error(`Database connection failed: ${err.message}`);
    return false;
  }
};
