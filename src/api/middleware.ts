/**
 * API Middleware — authentication, RBAC, and error handling.
 */

import { Request, Response, NextFunction } from 'express';
import { IdentityContext, Permission, RoleBinding, hasPermission } from '../domain/rbac';
import { TenantScope } from '../domain/account';
import { apiError, authError, TypedError, createTypedError } from '../domain/errors';
import { Store } from '../storage/store';
import { AuditService } from '../audit/audit-service';
import { AuditAction, AuditResourceType } from '../domain/audit';

/** Extended request with identity and scope context. */
export interface AuthenticatedRequest extends Request {
  identity?: IdentityContext;
  scope?: TenantScope;
  roleBindings?: RoleBinding[];
}

/**
 * Authentication middleware.
 * In production, this would validate JWT tokens or API keys.
 * For the reference implementation, it extracts identity from headers.
 */
export function authMiddleware(store: Store) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const identityId = req.headers['x-identity-id'] as string;
    const identityType = (req.headers['x-identity-type'] as string) || 'user';
    const accountId = req.headers['x-account-id'] as string || req.params.accountId || (req.body as any)?.accountId;

    if (!identityId || !accountId) {
      res.status(401).json(
        apiError(
          createTypedError({
            code: 'AUTH.UNAUTHENTICATED',
            message: 'Authentication required: provide x-identity-id and x-account-id headers',
            retryable: false,
          }),
        ),
      );
      return;
    }

    req.identity = {
      identityId,
      identityType: identityType as 'user' | 'service-principal',
      accountId,
    };

    // Load role bindings
    req.roleBindings = await store.roleBindings.listByIdentity(identityId, accountId);

    // Extract scope from various sources
    const projectId = req.headers['x-project-id'] as string || req.params.projectId || (req.body as any)?.projectId;
    const environmentId = req.headers['x-environment-id'] as string || req.params.environmentId || (req.body as any)?.environmentId;

    if (projectId && environmentId) {
      req.scope = { accountId, projectId, environmentId };
    }

    next();
  };
}

/** RBAC authorization middleware factory. */
export function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.identity || !req.roleBindings) {
      res.status(401).json(apiError(authError('Authentication required')));
      return;
    }

    const scope = {
      accountId: req.identity.accountId,
      projectId: req.scope?.projectId,
      environmentId: req.scope?.environmentId,
    };

    if (!hasPermission(req.roleBindings, req.identity, permission, scope)) {
      res.status(403).json(
        apiError(
          createTypedError({
            code: 'AUTH.FORBIDDEN',
            message: `Insufficient permissions: ${permission}`,
            retryable: false,
            details: { requiredPermission: permission },
          }),
        ),
      );
      return;
    }

    next();
  };
}

/** Audit logging middleware factory. */
export function auditLog(
  auditService: AuditService,
  action: AuditAction,
  resourceType: AuditResourceType,
  getResourceId: (req: AuthenticatedRequest) => string,
) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (req.identity) {
      try {
        await auditService.record({
          accountId: req.identity.accountId,
          projectId: req.scope?.projectId,
          environmentId: req.scope?.environmentId,
          actorId: req.identity.identityId,
          action,
          resourceType,
          resourceId: getResourceId(req),
          outcome: 'success',
        });
      } catch {
        // Audit logging should not block the request
      }
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
