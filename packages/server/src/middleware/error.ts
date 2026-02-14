/**
 * Error handling middleware
 */

import { Request, Response, NextFunction } from 'express';

export interface ErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    return next(err);
  }

  console.error('[error]', err);

  // Handle ApiError
  if ('code' in err && 'message' in err) {
    const apiErr = err as any;
    res.status(apiErr.status || 400).json({
      code: apiErr.code,
      message: apiErr.message,
      details: apiErr.details,
    });
    return;
  }

  // Handle common HTTP errors
  if (err.name === 'UnauthorizedError') {
    res.status(401).json({
      code: 'unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  if (err.name === 'ForbiddenError') {
    res.status(403).json({
      code: 'forbidden',
      message: 'Access denied',
    });
    return;
  }

  if (err.name === 'NotFoundError') {
    res.status(404).json({
      code: 'not_found',
      message: 'Resource not found',
    });
    return;
  }

  // Default error response
  res.status(500).json({
    code: 'internal_error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}
