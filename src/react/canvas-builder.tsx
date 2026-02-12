/**
 * CanvasBuilder — Voice-first flow building panel.
 *
 * The user selects nodes on the canvas and speaks/types commands.
 * An LLM interprets the intent, proposes a mutation, and the user
 * confirms before applying. No traditional builder UI.
 *
 * Props-driven — the LLM call is a callback prop (`onParseIntent`)
 * so consumers provide their own LLM integration.
 *
 * Interaction flow:
 * 1. User selects node(s) on canvas (click / shift+click)
 * 2. User types what they want ("make this an LLM step")
 * 3. Consumer's `onParseIntent` maps text → ParsedIntent
 * 4. Panel shows the proposed change + validation status
 * 5. User confirms ("yes", "do it") or refines
 * 6. Mutation applied via `onApplyMutation` callback
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Send,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Sparkles,
  Undo2,
} from 'lucide-react';
import type { FlowDefinition, FlowStep, UIStepType } from './types';
import {
  applyMutation,
  createBlankStep,
  type FlowMutation,
  type MutationResult,
} from './mutations';

// ── Types ────────────────────────────────────────────────

interface BuilderMessage {
  role: 'assistant' | 'user';
  text: string;
}

/** Parsed intent returned by the consumer's LLM integration */
export interface ParsedIntent {
  action: 'add' | 'remove' | 'update' | 'connect' | 'disconnect' | 'change-type' | 'unknown';
  stepType?: UIStepType;
  stepName?: string;
  targetStepIds: string[];
  changes?: Record<string, string>;
  description: string;
}

/** CanvasBuilder component props */
export interface CanvasBuilderProps {
  /** Current flow definition */
  flow: FlowDefinition;
  /** Currently selected step IDs on the canvas */
  selectedStepIds: Set<string>;
  /** Called when the user confirms a mutation */
  onApplyMutation: (result: MutationResult) => void;
  /** Called when the user closes the builder panel */
  onClose: () => void;
  /**
   * LLM integration callback. Given user text + context, return a ParsedIntent.
   * The consumer implements this using their own LLM provider (chatJSON, OpenAI, etc.)
   */
  onParseIntent: (
    userText: string,
    selectedStepIds: string[],
    steps: FlowStep[],
  ) => Promise<ParsedIntent>;
  /** Optional assistant name (default: "Assistant") */
  assistantName?: string;
  /** Additional CSS classes on root element */
  className?: string;
}

// ── Component ────────────────────────────────────────────

export function CanvasBuilder({
  flow,
  selectedStepIds,
  onApplyMutation,
  onClose,
  onParseIntent,
  assistantName = 'Assistant',
  className,
}: CanvasBuilderProps) {
  const [messages, setMessages] = useState<BuilderMessage[]>([
    { role: 'assistant', text: getGreeting(selectedStepIds.size) },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingResult, setPendingResult] = useState<MutationResult | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  // Update greeting when selection changes
  useEffect(() => {
    if (messages.length === 1 && messages[0].role === 'assistant') {
      setMessages([{ role: 'assistant', text: getGreeting(selectedStepIds.size) }]);
    }
  }, [selectedStepIds.size]);

  const addMessage = useCallback((msg: BuilderMessage) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  // ── Process user input ─────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;

    setInput('');
    addMessage({ role: 'user', text });
    setIsProcessing(true);

    try {
      // Check for confirmation of pending mutation
      if (pendingResult && isConfirmation(text)) {
        onApplyMutation(pendingResult);
        addMessage({ role: 'assistant', text: `Done. ${pendingResult.description}` });
        setPendingResult(null);
        setIsProcessing(false);
        return;
      }

      // Check for rejection of pending mutation
      if (pendingResult && isRejection(text)) {
        addMessage({ role: 'assistant', text: 'No problem. What would you like instead?' });
        setPendingResult(null);
        setIsProcessing(false);
        return;
      }

      // Parse the intent via consumer's LLM callback
      const selectedIds = Array.from(selectedStepIds);
      const intent = await onParseIntent(text, selectedIds, flow.steps);

      if (intent.action === 'unknown') {
        addMessage({
          role: 'assistant',
          text: "I'm not sure what you mean. Try something like 'add an LLM step after this' or 'remove this step'.",
        });
        setIsProcessing(false);
        return;
      }

      // Build the mutation
      const mutation = intentToMutation(intent, flow, selectedIds);
      if (!mutation) {
        addMessage({
          role: 'assistant',
          text: "I understand what you want but I can't build that mutation. Can you be more specific?",
        });
        setIsProcessing(false);
        return;
      }

      // Apply (dry run) and validate
      const result = applyMutation(flow, mutation);
      setPendingResult(result);

      if (result.valid) {
        addMessage({
          role: 'assistant',
          text: `${result.description}. The flow is still valid. Say "yes" to apply or tell me what to change.`,
        });
      } else {
        const errorSummary = result.errors.slice(0, 3).map(e => e.message).join('; ');
        addMessage({
          role: 'assistant',
          text: `${result.description}. But there are validation issues: ${errorSummary}. Say "yes" to apply anyway, or tell me how to fix it.`,
        });
      }
    } catch {
      addMessage({ role: 'assistant', text: "Something went wrong. Let's try again." });
    }

    setIsProcessing(false);
  }, [input, isProcessing, flow, selectedStepIds, pendingResult, addMessage, onApplyMutation, onParseIntent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className={`flex flex-col h-full bg-gray-900 border border-gray-700 rounded-lg overflow-hidden ${className ?? ''}`}>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-white">Voice Builder</span>
          {selectedStepIds.size > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
              {selectedStepIds.size} selected
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          aria-label="Close builder"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-200'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {/* Pending mutation preview */}
        {pendingResult && (
          <div
            className={`rounded-lg border p-3 text-xs ${
              pendingResult.valid
                ? 'border-green-500/30 bg-green-500/5'
                : 'border-yellow-500/30 bg-yellow-500/5'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {pendingResult.valid ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
              )}
              <span className="font-medium text-gray-200">
                {pendingResult.valid ? 'Valid change' : 'Has warnings'}
              </span>
            </div>
            <p className="text-gray-400">{pendingResult.description}</p>
            {pendingResult.errors.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-yellow-400">
                {pendingResult.errors.slice(0, 3).map((e, i) => (
                  <li key={i}>[{e.invariant}] {e.message}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 mt-2">
              <button
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-500 transition-colors"
                onClick={() => {
                  onApplyMutation(pendingResult);
                  addMessage({ role: 'assistant', text: `Applied. ${pendingResult.description}` });
                  setPendingResult(null);
                }}
              >
                <Check className="h-3 w-3" /> Apply
              </button>
              <button
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                onClick={() => {
                  addMessage({ role: 'assistant', text: 'Cancelled. What else?' });
                  setPendingResult(null);
                }}
              >
                <Undo2 className="h-3 w-3" /> Cancel
              </button>
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {assistantName} is thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-gray-700 p-2">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedStepIds.size > 0
                ? 'Tell me what to change...'
                : 'Select nodes first, then speak...'
            }
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
          />
          <button
            className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none"
            disabled={!input.trim() || isProcessing}
            onClick={handleSubmit}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function getGreeting(selectionCount: number): string {
  if (selectionCount === 0) {
    return 'Select a node on the canvas (shift+click for multiple), then tell me what you want to change.';
  }
  if (selectionCount === 1) {
    return 'Got it \u2014 one node selected. What do you want to do with it?';
  }
  return `${selectionCount} nodes selected. What would you like to do?`;
}

function isConfirmation(text: string): boolean {
  const t = text.toLowerCase().trim();
  return ['yes', 'y', 'do it', 'apply', 'confirm', 'go', 'ok', 'sure', 'yep', 'yeah'].includes(t);
}

function isRejection(text: string): boolean {
  const t = text.toLowerCase().trim();
  return ['no', 'n', 'cancel', 'undo', 'nope', 'nevermind', 'never mind', 'nah'].includes(t);
}

function intentToMutation(
  intent: ParsedIntent,
  flow: FlowDefinition,
  selectedIds: string[],
): FlowMutation | null {
  const existingIds = new Set(flow.steps.map(s => s.id));

  switch (intent.action) {
    case 'add': {
      const type = intent.stepType ?? 'transform';
      const name = intent.stepName ?? `New ${type} step`;
      const afterId = intent.targetStepIds[0] ?? selectedIds[0];
      const step = createBlankStep(type, name, existingIds, afterId ? [afterId] : []);
      return { type: 'add-step', step, afterStepId: afterId };
    }

    case 'remove': {
      const targets = intent.targetStepIds.length > 0 ? intent.targetStepIds : selectedIds;
      if (targets.length === 1) {
        return { type: 'remove-step', stepId: targets[0] };
      }
      return {
        type: 'batch',
        mutations: targets.map(id => ({ type: 'remove-step' as const, stepId: id })),
        description: `Remove ${targets.length} steps`,
      };
    }

    case 'update': {
      const targets = intent.targetStepIds.length > 0 ? intent.targetStepIds : selectedIds;
      if (targets.length === 0) return null;
      const changes: Partial<FlowStep> = {};
      if (intent.changes) {
        for (const [key, val] of Object.entries(intent.changes)) {
          if (key === 'name' || key === 'description' || key === 'prompt' || key === 'userMessage') {
            (changes as Record<string, string>)[key] = val;
          }
        }
      }
      if (targets.length === 1) {
        return { type: 'update-step', stepId: targets[0], changes };
      }
      return {
        type: 'batch',
        mutations: targets.map(id => ({ type: 'update-step' as const, stepId: id, changes })),
        description: `Update ${targets.length} steps`,
      };
    }

    case 'connect': {
      const ids = intent.targetStepIds.length >= 2 ? intent.targetStepIds : selectedIds;
      if (ids.length < 2) return null;
      return { type: 'connect', fromId: ids[0], toId: ids[1] };
    }

    case 'disconnect': {
      const ids = intent.targetStepIds.length >= 2 ? intent.targetStepIds : selectedIds;
      if (ids.length < 2) return null;
      return { type: 'disconnect', fromId: ids[0], toId: ids[1] };
    }

    case 'change-type': {
      const newType = intent.stepType;
      if (!newType) return null;
      const targets = intent.targetStepIds.length > 0 ? intent.targetStepIds : selectedIds;
      if (targets.length === 0) return null;
      if (targets.length === 1) {
        return { type: 'change-type', stepId: targets[0], newType };
      }
      return {
        type: 'batch',
        mutations: targets.map(id => ({ type: 'change-type' as const, stepId: id, newType })),
        description: `Change ${targets.length} steps to ${newType}`,
      };
    }

    default:
      return null;
  }
}
