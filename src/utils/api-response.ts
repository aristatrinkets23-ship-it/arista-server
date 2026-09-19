export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export class ApiResponse<T> {
  public success: boolean;
  public statusCode: number;
  public message: string;
  public data?: T;
  public meta?: PaginationMeta;

  constructor(statusCode: number, message: string, data?: T, meta?: PaginationMeta) {
    this.success = statusCode >= 200 && statusCode < 300;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.meta = meta;
  }

  public static success<T>(message: string, data?: T, meta?: PaginationMeta, statusCode: number = 200): ApiResponse<T> {
    return new ApiResponse<T>(statusCode, message, data, meta);
  }

  public static created<T>(message: string, data?: T): ApiResponse<T> {
    return new ApiResponse<T>(201, message, data);
  }

  public static error(message: string, statusCode: number = 400): ApiResponse<null> {
    return new ApiResponse<null>(statusCode, message);
  }
}
