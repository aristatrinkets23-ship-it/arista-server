import app from '../src/app';
import { checkDatabaseConnection } from '../src/config/database';

// Trigger automatic table creation and admin seed on serverless function initialization
checkDatabaseConnection().catch((err) => {
  console.warn('Initial DB connection check notice:', err.message);
});

export default app;
