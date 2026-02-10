/**
 * Account API routes.
 *
 * POST /accounts — Programmatic account (organization/tenant) creation
 * with tenancy bootstrapping.
 */

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { Account, AccountStatus, Project, Environment, EnvironmentType } from '../domain/account';
import { Role, RbacScopeLevel, RoleBinding } from '../domain/rbac';
import { Store } from '../storage/store';
import { AuditService } from '../audit/audit-service';
import { apiError, validationError } from '../domain/errors';

export function createAccountRoutes(store: Store, auditService: AuditService): Router {
  const router = Router();

  /**
   * POST /accounts
   * Create a new account with default project and environments.
   */
  router.post('/', async (req, res) => {
    try {
      const { name, residency, adminIdentityId } = req.body;

      if (!name) {
        res.status(400).json(apiError(validationError('Account name is required')));
        return;
      }

      if (!adminIdentityId) {
        res.status(400).json(apiError(validationError('adminIdentityId is required for initial RBAC setup')));
        return;
      }

      const now = new Date().toISOString();

      // Create account
      const account: Account = {
        id: `acct_${uuid()}`,
        name,
        createdAt: now,
        updatedAt: now,
        residency: residency ?? undefined,
        status: AccountStatus.Active,
      };
      await store.accounts.create(account);

      // Create default project
      const project: Project = {
        id: `proj_${uuid()}`,
        accountId: account.id,
        name: 'Default Project',
        description: 'Default project created during account setup',
        createdAt: now,
        updatedAt: now,
      };
      await store.projects.create(project);

      // Create default environments
      const environments: Environment[] = [];
      for (const envType of [EnvironmentType.Development, EnvironmentType.Staging, EnvironmentType.Production]) {
        const env: Environment = {
          id: `env_${uuid()}`,
          accountId: account.id,
          projectId: project.id,
          name: envType,
          type: envType,
          createdAt: now,
          updatedAt: now,
        };
        await store.environments.create(env);
        environments.push(env);
      }

      // Create admin role binding
      const adminBinding: RoleBinding = {
        id: `rb_${uuid()}`,
        identityId: adminIdentityId,
        identityType: 'user',
        role: Role.Admin,
        scopeLevel: RbacScopeLevel.Organization,
        accountId: account.id,
        createdAt: now,
      };
      await store.roleBindings.create(adminBinding);

      // Audit
      await auditService.record({
        accountId: account.id,
        actorId: adminIdentityId,
        action: 'account.created',
        resourceType: 'account',
        resourceId: account.id,
        outcome: 'success',
        details: { projectId: project.id, environments: environments.map((e) => e.id) },
      });

      res.status(201).json({
        account,
        project,
        environments,
        roleBinding: adminBinding,
      });
    } catch (err) {
      res.status(500).json(
        apiError({
          code: 'SYSTEM.INTERNAL',
          message: err instanceof Error ? err.message : 'Account creation failed',
          retryable: false,
          suggestedFixes: [],
        }),
      );
    }
  });

  /**
   * GET /accounts/:accountId
   * Fetch account details.
   */
  router.get('/:accountId', async (req, res) => {
    const account = await store.accounts.getById(req.params.accountId);
    if (!account) {
      res.status(404).json(
        apiError({
          code: 'VALIDATION.NOT_FOUND',
          message: `Account not found: ${req.params.accountId}`,
          retryable: false,
          suggestedFixes: [],
        }),
      );
      return;
    }
    res.json({ account });
  });

  return router;
}
