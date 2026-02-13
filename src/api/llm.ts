/**
 * LLM API routes.
 *
 * POST /api/llm/chat — Send a chat request and get structured JSON back
 * POST /api/llm/propose — Use the LLM planner to propose a workflow from a goal
 */

import { Router } from 'express';
import { apiError, validationError } from '../domain/errors';
import {
  chatJSON,
  LLMParseError,
  LLMProviderError,
  LLMProvider,
  ChatMessage,
} from '../llm/index';
import { LLMPlanner } from '../llm/llm-planner';
import { PlanGoal } from '../planner/interface';
import { AuthenticatedRequest } from './middleware';

export function createLLMRoutes(): Router {
  const router = Router();

  /**
   * POST /llm/chat
   *
   * Send a prompt to an LLM and receive structured JSON back.
   *
   * Body:
   *   provider: LLMProvider (required)
   *   model: string (required)
   *   messages: ChatMessage[] (required)
   *   systemPrompt?: string
   *   apiKey: string (required)
   *   maxTokens?: number
   *   temperature?: number
   */
  router.post('/chat', async (req: AuthenticatedRequest, res) => {
    try {
      const { provider, model, messages, systemPrompt, apiKey, maxTokens, temperature } = req.body;

      if (!provider || !model || !messages || !apiKey) {
        res.status(400).json(
          apiError(validationError('provider, model, messages, and apiKey are required')),
        );
        return;
      }

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json(
          apiError(validationError('messages must be a non-empty array')),
        );
        return;
      }

      const result = await chatJSON({
        provider: provider as LLMProvider,
        model,
        messages: messages as ChatMessage[],
        systemPrompt,
        apiKey,
        maxTokens,
        temperature,
      });

      res.json({ result });
    } catch (err) {
      if (err instanceof LLMParseError) {
        res.status(422).json(apiError(err.typedError));
        return;
      }
      if (err instanceof LLMProviderError) {
        const status = err.statusCode ?? 502;
        res.status(status >= 400 && status < 600 ? status : 502).json(apiError(err.typedError));
        return;
      }
      res.status(500).json(
        apiError({
          code: 'SYSTEM.INTERNAL',
          message: err instanceof Error ? err.message : 'LLM chat request failed',
          retryable: false,
          suggestedFixes: [],
        }),
      );
    }
  });

  /**
   * POST /llm/propose
   *
   * Use the LLM planner to convert a natural-language goal into a
   * workflow proposal.
   *
   * Body:
   *   provider: LLMProvider (required)
   *   model: string (required)
   *   apiKey: string (required)
   *   goal: PlanGoal (required)
   *   maxTokens?: number
   *   temperature?: number
   */
  router.post('/propose', async (req: AuthenticatedRequest, res) => {
    try {
      const { provider, model, apiKey, goal, maxTokens, temperature } = req.body;

      if (!provider || !model || !apiKey || !goal) {
        res.status(400).json(
          apiError(validationError('provider, model, apiKey, and goal are required')),
        );
        return;
      }

      if (!goal.description || !goal.targetDslVersion) {
        res.status(400).json(
          apiError(validationError('goal must include description and targetDslVersion')),
        );
        return;
      }

      const planner = new LLMPlanner({
        provider: provider as LLMProvider,
        model,
        apiKey,
        maxTokens,
        temperature,
      });

      const proposal = await planner.proposeWorkflow(goal as PlanGoal);

      res.json({ proposal, plannerInfo: planner.getVersionInfo() });
    } catch (err) {
      if (err instanceof LLMParseError) {
        res.status(422).json(apiError(err.typedError));
        return;
      }
      if (err instanceof LLMProviderError) {
        const status = err.statusCode ?? 502;
        res.status(status >= 400 && status < 600 ? status : 502).json(apiError(err.typedError));
        return;
      }
      res.status(500).json(
        apiError({
          code: 'SYSTEM.INTERNAL',
          message: err instanceof Error ? err.message : 'Workflow proposal failed',
          retryable: false,
          suggestedFixes: [],
        }),
      );
    }
  });

  return router;
}
