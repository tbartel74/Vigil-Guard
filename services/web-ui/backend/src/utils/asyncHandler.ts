/**
 * Async Handler Utility
 * Wraps async route handlers to automatically catch and forward errors
 * to Express error handling middleware.
 *
 * Sprint 2.2: Error Handling Improvement
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route handler to catch promise rejections
 * and forward them to Express error middleware.
 *
 * Usage:
 * ```typescript
 * router.get('/path', asyncHandler(async (req, res) => {
 *   const data = await someAsyncOperation();
 *   res.json(data);
 * }));
 * ```
 *
 * Without this wrapper, unhandled promise rejections in async handlers
 * would cause the request to hang without any response.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handler middleware for Express
 * Should be added at the end of middleware chain
 *
 * Usage:
 * ```typescript
 * app.use(globalErrorHandler);
 * ```
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('[Global Error Handler]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Don't leak stack traces in production
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    error: 'Internal server error',
    message: isDev ? err.message : 'An unexpected error occurred',
    ...(isDev && { stack: err.stack })
  });
}

export default asyncHandler;
