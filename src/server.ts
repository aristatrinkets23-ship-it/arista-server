import app from './app';
import dotenv from 'dotenv';
import { checkDatabaseConnection } from './config/database';
import { logger } from './utils/logger';

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  logger.info('Initializing Arista Trinkets REST API backend...');

  // Verify DB connectivity (non-blocking warning if db is not yet spun up)
  const isDbConnected = await checkDatabaseConnection();
  if (!isDbConnected) {
    logger.warn('Warning: DB connection could not be established immediately. Verify MySQL server status.');
  }

  app.listen(PORT, () => {
    logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
    logger.info(`Health check available at http://localhost:${PORT}/api/v1/health`);
  });
};

startServer();
