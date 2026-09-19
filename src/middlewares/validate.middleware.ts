import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ApiResponse } from '../utils/api-response';

export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: (err as any).path || (err as any).param,
      message: err.msg
    }));

    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: 'Validation failure',
      errors: formattedErrors
    });
  }
  next();
};
