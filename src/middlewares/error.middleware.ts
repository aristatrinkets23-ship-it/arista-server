import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../utils/api-response';
import { logger } from '../utils/logger';

export class AppError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`[${req.method}] ${req.url} - Status: ${statusCode} - Error: ${message}`);

  res.status(statusCode).json(ApiResponse.error(message, statusCode));
};
