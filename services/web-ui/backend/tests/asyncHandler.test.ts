/**
 * Unit tests for asyncHandler utility
 * Tests async route handler wrapper and global error handler
 *
 * Sprint 2.2: Error Handling
 */

import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { asyncHandler, globalErrorHandler } from '../src/utils/asyncHandler.js';

// Mock Express objects
const mockRequest = () => ({
  path: '/test',
  method: 'GET'
}) as unknown as Request;

const mockResponse = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};

const mockNext: NextFunction = vi.fn();

describe('asyncHandler', () => {
  it('should call the async handler function', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapped = asyncHandler(handler);

    const req = mockRequest();
    const res = mockResponse();

    await wrapped(req, res, mockNext);

    expect(handler).toHaveBeenCalledWith(req, res, mockNext);
  });

  it('should pass successful results through', async () => {
    const handler = async (req: Request, res: Response) => {
      res.json({ success: true });
    };
    const wrapped = asyncHandler(handler);

    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    await wrapped(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('should catch promise rejections and pass to next()', async () => {
    const error = new Error('Test error');
    const handler = vi.fn().mockRejectedValue(error);
    const wrapped = asyncHandler(handler);

    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    await wrapped(req, res, next);

    // The error should be passed to next()
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should catch thrown errors and pass to next()', async () => {
    const error = new Error('Thrown error');
    const handler = async () => {
      throw error;
    };
    const wrapped = asyncHandler(handler);

    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    await wrapped(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('globalErrorHandler', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should respond with 500 status code', () => {
    const error = new Error('Server error');
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    globalErrorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('should include error message in development mode', () => {
    process.env.NODE_ENV = 'development';
    const error = new Error('Detailed error message');
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    globalErrorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Internal server error',
        message: 'Detailed error message',
        stack: expect.any(String)
      })
    );
  });

  it('should hide error details in production mode', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('Sensitive error details');
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    globalErrorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      message: 'An unexpected error occurred'
    });

    // Stack should NOT be included in production
    const jsonCall = (res.json as any).mock.calls[0][0];
    expect(jsonCall.stack).toBeUndefined();
  });

  it('should log error details to console', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Logged error');
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    globalErrorHandler(error, req, res, next);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
