import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { ensureTablesExist } from '../config/database';

dotenv.config();

async function resetDatabase() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'arista_trinkets_db';

  console.log(`\n==================================================`);
  console.log(`⚠️  RESETTING DATABASE: ${dbName} (${host}:${port})`);
  console.log(`==================================================\n`);

  let connection;
  try {
    // Connect without database pre-selected to perform DB drop/create
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true
    });

    console.log(`1. Dropping existing database '${dbName}'...`);
    await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\`;`);

    console.log(`2. Creating fresh database '${dbName}'...`);
    await connection.query(
      `CREATE DATABASE \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );

    await connection.query(`USE \`${dbName}\`;`);

    console.log(`3. Rebuilding database schema and seeding default admin...`);
    await ensureTablesExist(connection as any);

    console.log(`\n==================================================`);
    console.log(`✅ Fresh database '${dbName}' created successfully!`);
    console.log(`==================================================`);
    console.log(`Default Super Admin Credentials:`);
    console.log(`   Email:    ${process.env.DEFAULT_ADMIN_EMAIL || 'admin@aristatrinkets.com'}`);
    console.log(`   Password: ${process.env.DEFAULT_ADMIN_PASSWORD || 'admin123'}\n`);

  } catch (error: any) {
    console.error(`\n❌ Error resetting database: ${error.message}\n`);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
    process.exit(0);
  }
}

resetDatabase();
