import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
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

export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    const connection = await pool.getConnection();
    logger.info('Successfully connected to MySQL database pool.');
    connection.release();
    return true;
  } catch (err: any) {
    logger.error(`Database connection failed: ${err.message}`);
    return false;
  }
};
