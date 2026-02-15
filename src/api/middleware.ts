/**
 * API Middleware — identity context extraction and error handling.
 */

import { Request, Response, NextFunction } from 'express';
import { TenantScope } from '../domain/account';
import { apiError, TypedError, createTypedError } from '../domain/errors';
import { Store } from '../storage/store';

/** Identity context extracted from request headers. */
export interface IdentityContext {
  identityId: string;
  identityType: 'user' | 'service-principal';
  accountId?: string;
}

/** Extended request with identity and optional scope context. */
export interface AuthenticatedRequest extends Request {
  identity?: IdentityContext;
  scope?: TenantScope;
}

/**
 * Default identity middleware.
 * Extracts identity and optional tenant scope from headers.
 * No authentication required — this is a library server.
 */
export function defaultIdentityMiddleware(store: Store) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const identityId = (req.headers['x-identity-id'] as string) || 'anonymous';
    const rawIdentityType = (req.headers['x-identity-type'] as string) || 'user';
    const identityType: 'user' | 'service-principal' =
      rawIdentityType === 'service-principal' ? 'service-principal' : 'user';
    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
    const accountId = req.headers['x-account-id'] as string || req.params.accountId || (typeof body.accountId === 'string' ? body.accountId : undefined);

    if (identityId) {
      req.identity = {
        identityId,
        identityType,
        ...(accountId ? { accountId } : {}),
      };
    }

    // Extract optional scope from various sources
    const projectId = req.headers['x-project-id'] as string || req.params.projectId || (typeof body.projectId === 'string' ? body.projectId : undefined);
    const environmentId = req.headers['x-environment-id'] as string || req.params.environmentId || (typeof body.environmentId === 'string' ? body.environmentId : undefined);

    if (accountId && projectId && environmentId) {
      req.scope = { accountId, projectId, environmentId };
    }

    next();
  };
}

/** Global error handling middleware. */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err.typedError) {
    const status = getHttpStatus(err.typedError);
    res.status(status).json(apiError(err.typedError));
    return;
  }

  const typedError = createTypedError({
    code: 'SYSTEM.INTERNAL',
    message: err.message || 'Internal server error',
    retryable: false,
  });

  res.status(500).json(apiError(typedError));
}

function getHttpStatus(error: TypedError): number {
  if (error.code.startsWith('AUTH.UNAUTHENTICATED')) return 401;
  if (error.code.startsWith('AUTH.')) return 403;
  if (error.code.includes('NOT_FOUND')) return 404;
  if (error.code.startsWith('VALIDATION.')) return 400;
  if (error.code.startsWith('RATE_LIMIT.')) return 429;
  if (error.code.startsWith('WORKFLOW.')) return 422;
  if (error.code.startsWith('PLANNER.')) return 422;
  return 500;
}
