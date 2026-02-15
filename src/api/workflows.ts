/**
 * Workflow API routes.
 *
 * POST /workflows — Create a workflow DSL definition
 * GET /workflows/:workflowId — Fetch workflow definition
 * PUT /workflows/:workflowId — Update workflow (new version)
 * POST /workflows/:workflowId/test — Validate and test workflow
 */

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { Workflow, WorkflowStatus, CreateWorkflowInput, Step } from '../domain/workflow';
import { TenantScope } from '../domain/account';
import { apiError, validationError, notFoundError } from '../domain/errors';
import { Store } from '../storage/store';
import { AuditService } from '../audit/audit-service';
import { WorkflowExecutor } from '../engine/executor';
import { compileWorkflow } from '../dsl/compiler';
import { CURRENT_DSL_VERSION } from '../dsl/version';
import { AuthenticatedRequest } from './middleware';

export function createWorkflowRoutes(
  store: Store,
  auditService: AuditService,
  executor: WorkflowExecutor,
): Router {
  const router = Router();

  /**
   * POST /workflows
   * Create a new workflow DSL definition.
   */
  router.post('/', async (req: AuthenticatedRequest, res) => {
    try {
      const body = req.body as CreateWorkflowInput;

      if (!body.name || !body.accountId || !body.projectId || !body.environmentId) {
        res.status(400).json(
          apiError(validationError('name, accountId, projectId, and environmentId are required')),
        );
        return;
      }

      if (!body.entryStepId || !body.steps || body.steps.length === 0) {
        res.status(400).json(
          apiError(validationError('entryStepId and at least one step are required')),
        );
        return;
      }

      if (!body.determinism) {
        res.status(400).json(
          apiError(validationError('determinism configuration is required')),
        );
        return;
      }

      const now = new Date().toISOString();
      const workflowId = `wf_${uuid()}`;

      const workflow: Workflow = {
        id: workflowId,
        accountId: body.accountId,
        projectId: body.projectId,
        environmentId: body.environmentId,
        name: body.name,
        description: body.description,
        version: 1,
        specVersion: body.specVersion ?? CURRENT_DSL_VERSION,
        status: WorkflowStatus.Draft,
        createdAt: now,
        updatedAt: now,
        determinism: body.determinism,
        entryStepId: body.entryStepId,
        steps: body.steps.map((s) => ({ ...s, workflowId: workflowId } as Step)),
        secrets: body.secrets ?? [],
        notification: body.notification,
      };

      // Validate and compile
      const compilation = compileWorkflow(workflow);
      if (!compilation.success) {
        res.status(422).json(
          apiError({
            code: 'WORKFLOW.COMPILATION',
            message: 'Workflow validation/compilation failed',
            retryable: false,
            details: { errors: compilation.errors },
            suggestedFixes: compilation.errors.flatMap((e) => e.suggestedFixes),
          }),
        );
        return;
      }

      // Persist
      await store.workflows.create(workflow);

      // Audit
      if (req.identity) {
        await auditService.record({
          accountId: body.accountId,
          projectId: body.projectId,
          environmentId: body.environmentId,
          actorId: req.identity.identityId,
          action: 'workflow.created',
          resourceType: 'workflow',
          resourceId: workflowId,
          outcome: 'success',
        });
      }

      res.status(201).json({
        workflow,
        compilation: {
          determinismAnalysis: compilation.plan?.determinismAnalysis,
          executionOrder: compilation.plan?.executionOrder,
        },
      });
    } catch (err) {
      res.status(500).json(
        apiError({
          code: 'SYSTEM.INTERNAL',
          message: err instanceof Error ? err.message : 'Workflow creation failed',
          retryable: false,
          suggestedFixes: [],
        }),
      );
    }
  });

  /**
   * GET /workflows/:workflowId
   * Fetch workflow definition and version metadata.
   */
  router.get('/:workflowId', async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.scope) {
        res.status(400).json(apiError(validationError('Tenant scope headers required (x-account-id, x-project-id, x-environment-id)')));
        return;
      }

      const workflow = await store.workflows.getById(req.params.workflowId, req.scope);
      if (!workflow) {
        res.status(404).json(apiError(notFoundError('Workflow', req.params.workflowId)));
        return;
      }

      res.json({ workflow });
    } catch (err) {
      res.status(500).json(apiError({
        code: 'SYSTEM.INTERNAL',
        message: err instanceof Error ? err.message : 'Failed to fetch workflow',
        retryable: false,
        suggestedFixes: [],
      }));
    }
  });

  /**
   * PUT /workflows/:workflowId
   * Update workflow definition (creates new version).
   */
  router.put('/:workflowId', async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.scope) {
        res.status(400).json(apiError(validationError('Tenant scope headers required')));
        return;
      }

      const existing = await store.workflows.getById(req.params.workflowId, req.scope);
      if (!existing) {
        res.status(404).json(apiError(notFoundError('Workflow', req.params.workflowId)));
        return;
      }

      const updates = req.body;
      const now = new Date().toISOString();

      const updated: Workflow = {
        ...existing,
        name: updates.name ?? existing.name,
        description: updates.description ?? existing.description,
        determinism: updates.determinism ?? existing.determinism,
        entryStepId: updates.entryStepId ?? existing.entryStepId,
        steps: updates.steps
          ? updates.steps.map((s: any) => ({ ...s, workflowId: existing.id }))
          : existing.steps,
        secrets: updates.secrets ?? existing.secrets,
        notification: updates.notification ?? existing.notification,
        version: existing.version + 1,
        updatedAt: now,
        status: WorkflowStatus.Active,
      };

      // Validate and compile
      const compilation = compileWorkflow(updated);
      if (!compilation.success) {
        res.status(422).json(
          apiError({
            code: 'WORKFLOW.COMPILATION',
            message: 'Updated workflow validation/compilation failed',
            retryable: false,
            details: { errors: compilation.errors },
            suggestedFixes: compilation.errors.flatMap((e) => e.suggestedFixes),
          }),
        );
        return;
      }

      await store.workflows.update(existing.id, updated);

      // Audit
      if (req.identity) {
        await auditService.record({
          accountId: req.scope.accountId,
          projectId: req.scope.projectId,
          environmentId: req.scope.environmentId,
          actorId: req.identity.identityId,
          action: 'workflow.updated',
          resourceType: 'workflow',
          resourceId: existing.id,
          outcome: 'success',
          details: { previousVersion: existing.version, newVersion: updated.version },
        });
      }

      res.json({
        workflow: updated,
        compilation: {
          determinismAnalysis: compilation.plan?.determinismAnalysis,
          executionOrder: compilation.plan?.executionOrder,
        },
      });
    } catch (err) {
      res.status(500).json(
        apiError({
          code: 'SYSTEM.INTERNAL',
          message: err instanceof Error ? err.message : 'Workflow update failed',
          retryable: false,
          suggestedFixes: [],
        }),
      );
    }
  });

  /**
   * POST /workflows/:workflowId/test
   * Validate and test workflow without a full production run.
   */
  router.post('/:workflowId/test', async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.scope) {
        res.status(400).json(apiError(validationError('Tenant scope headers required')));
        return;
      }

      const workflow = await store.workflows.getById(req.params.workflowId, req.scope);
      if (!workflow) {
        res.status(404).json(apiError(notFoundError('Workflow', req.params.workflowId)));
        return;
      }

      const testResult = await executor.testWorkflow(workflow, req.scope);

      res.json({ test: testResult });
    } catch (err) {
      res.status(500).json(
        apiError({
          code: 'SYSTEM.INTERNAL',
          message: err instanceof Error ? err.message : 'Workflow test failed',
          retryable: false,
          suggestedFixes: [],
        }),
      );
    }
  });

  return router;
}
