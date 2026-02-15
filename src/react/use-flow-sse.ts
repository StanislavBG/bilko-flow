/**
 * useFlowSSE — Generic React hook for consuming Server-Sent Event (SSE)
 * streams and mapping them to FlowProgressStep state.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS HOOK EXISTS — THE SINGLE BIGGEST REASON THE LIBRARY WAS ABANDONED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The NPR podcast pipeline consumer cited SSE integration as the primary
 * friction point that led to abandoning bilko-flow. Their server emitted
 * per-step progress events via SSE (e.g. "Chunk 2/5 transcribed — 3.2 MB")
 * and they needed to:
 *
 *   1. Open an EventSource connection to a URL.
 *   2. Parse incoming JSON event payloads.
 *   3. Map each event to a step update (status change, message, progress).
 *   4. Maintain a step state map (stepId → FlowProgressStep).
 *   5. Handle reconnection on network failure.
 *   6. Handle cleanup on component unmount.
 *   7. Feed the resulting step array to <FlowProgress>.
 *
 * This required ~80 lines of boilerplate in the consuming app. The boilerplate
 * was identical across every SSE-consuming component, but bilko-flow provided
 * no abstraction for it. The consumer concluded that the library "couldn't
 * natively consume SSE streams" and built a fully custom solution.
 *
 * `useFlowSSE` eliminates that boilerplate entirely. It is:
 *
 *   - **Generic over the SSE event payload type** (`T`). The consumer defines
 *     what their server sends (could be JSON objects, strings, binary
 *     references, audio chunks, anything) and provides a `mapEvent` function
 *     that translates `T` into step updates.
 *
 *   - **Delivery-mode agnostic**. Works with:
 *     • Single events (one event = one step update)
 *     • Streaming/drip (many events updating the same step incrementally)
 *     • Batch events (one event updates multiple steps)
 *     • Any combination thereof
 *
 *   - **Data-type agnostic**. The `meta` bag on FlowProgressStep can hold
 *     text, audio references, video URIs, binary payload sizes, custom JSON,
 *     etc. The hook doesn't care what goes in `meta` — it just passes
 *     through whatever `mapEvent` returns.
 *
 *   - **Resilient**. Handles:
 *     • Auto-reconnection with configurable retry logic
 *     • Connection state tracking (connecting/connected/disconnected/error)
 *     • Cleanup on unmount (closes EventSource, clears timers)
 *     • Error events with consumer-provided error handlers
 *
 * ## FOR AGENT / LLM AUTHORS
 *
 * Use this hook when your backend emits SSE events for flow progress.
 * You provide:
 *   1. `url` — The SSE endpoint URL.
 *   2. `initialSteps` — The initial step definitions (before any events).
 *   3. `mapEvent<T>(event: T)` — Maps a parsed SSE event to step updates.
 *
 * The hook returns:
 *   - `steps` — The current FlowProgressStep array (feed to <FlowProgress>).
 *   - `connectionState` — 'connecting' | 'connected' | 'disconnected' | 'error'.
 *   - `lastEvent` — The most recent raw event (for debugging/logging).
 *   - `close()` — Manually close the connection.
 *   - `reconnect()` — Manually trigger a reconnection.
 *
 * @example Basic SSE consumption
 * ```tsx
 * interface PipelineEvent {
 *   stepId: string;
 *   status: 'active' | 'complete' | 'error';
 *   message?: string;
 *   progress?: number;
 * }
 *
 * function PipelineProgress({ runId }: { runId: string }) {
 *   const { steps, connectionState } = useFlowSSE<PipelineEvent>({
 *     url: `/api/runs/${runId}/events`,
 *     initialSteps: [
 *       { id: 'download', label: 'Download', status: 'pending' },
 *       { id: 'transcode', label: 'Transcode', status: 'pending' },
 *       { id: 'upload', label: 'Upload', status: 'pending' },
 *     ],
 *     mapEvent: (event) => ({
 *       stepId: event.stepId,
 *       updates: {
 *         status: event.status,
 *         meta: {
 *           message: event.message,
 *           progress: event.progress,
 *         },
 *       },
 *     }),
 *   });
 *
 *   return (
 *     <FlowProgress
 *       mode="expanded"
 *       steps={steps}
 *       status={connectionState === 'connected' ? 'running' : 'idle'}
 *     />
 *   );
 * }
 * ```
 *
 * @example Streaming audio with custom meta
 * ```tsx
 * interface AudioEvent {
 *   type: 'chunk' | 'done' | 'error';
 *   stepId: string;
 *   chunkIndex?: number;
 *   totalChunks?: number;
 *   audioUri?: string;
 *   error?: string;
 * }
 *
 * const { steps } = useFlowSSE<AudioEvent>({
 *   url: '/api/audio/stream',
 *   initialSteps: [{ id: 'stream', label: 'Stream Audio', status: 'pending' }],
 *   mapEvent: (event) => ({
 *     stepId: event.stepId,
 *     updates: {
 *       status: event.type === 'done' ? 'complete' : event.type === 'error' ? 'error' : 'active',
 *       meta: {
 *         message: event.type === 'chunk'
 *           ? `Chunk ${event.chunkIndex}/${event.totalChunks}`
 *           : undefined,
 *         mediaType: 'audio/mpeg',
 *         mediaUri: event.audioUri,
 *         chunksProcessed: event.chunkIndex,
 *         chunksTotal: event.totalChunks,
 *         error: event.error,
 *       },
 *     },
 *   }),
 * });
 * ```
 *
 * @example Batch event (one event updates multiple steps)
 * ```tsx
 * interface BatchEvent {
 *   updates: Array<{ stepId: string; status: string; message?: string }>;
 * }
 *
 * const { steps } = useFlowSSE<BatchEvent>({
 *   url: '/api/batch/events',
 *   initialSteps: batchSteps,
 *   mapEvent: (event) => event.updates.map(u => ({
 *     stepId: u.stepId,
 *     updates: {
 *       status: u.status as FlowProgressStep['status'],
 *       meta: { message: u.message },
 *     },
 *   })),
 * });
 * ```
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { FlowProgressStep } from './types';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

/**
 * Connection state of the SSE stream.
 *
 * - 'connecting'    — EventSource is being created or reconnecting.
 * - 'connected'     — EventSource is open and receiving events.
 * - 'disconnected'  — Cleanly closed (by consumer or server).
 * - 'error'         — Connection failed and retry limit reached.
 */
export type SSEConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * A single step update produced by `mapEvent`.
 *
 * Contains the `stepId` to update and a partial `updates` object that
 * is shallow-merged onto the existing step. Any fields not present in
 * `updates` are left unchanged on the step.
 *
 * The `meta` field in updates is DEEP-MERGED with existing meta — this
 * means you can incrementally add meta keys without overwriting keys
 * set by previous events. To clear a meta key, explicitly set it to
 * `undefined`.
 */
export interface SSEStepUpdate {
  /** The step ID to update. Must match a step in the current state. */
  stepId: string;
  /** Partial updates to merge onto the step. */
  updates: Partial<Pick<FlowProgressStep, 'status' | 'label' | 'type' | 'meta'>>;
}

/**
 * Options for useFlowSSE.
 *
 * Generic over `T` — the shape of your SSE event payloads. You define
 * what `T` looks like and provide `mapEvent` to translate `T` into
 * step updates.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DESIGN NOTE — WHY GENERIC OVER T
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Making the hook generic over the event payload type means bilko-flow
 * NEVER needs to know what your server sends. Whether it's:
 *   - JSON objects with step statuses
 *   - Newline-delimited JSON (NDJSON)
 *   - Custom protocol messages
 *   - Binary size notifications
 *   - Audio/video chunk metadata
 *   - Batch updates with multiple steps
 *
 * ...the hook handles the SSE lifecycle, and `mapEvent` handles the
 * translation. No new types, no new interfaces, no library releases
 * needed to support new event shapes.
 * ═══════════════════════════════════════════════════════════════════════
 */
export interface UseFlowSSEOptions<T> {
  /**
   * The SSE endpoint URL. When this changes, the existing connection
   * is closed and a new one is opened (the hook is "URL-reactive").
   */
  url: string;

  /**
   * Initial step definitions before any SSE events arrive.
   * These are the "shape" of the flow — step IDs, labels, and
   * starting statuses (usually all 'pending').
   */
  initialSteps: FlowProgressStep[];

  /**
   * Map a parsed SSE event payload to step update(s).
   *
   * Return a SINGLE SSEStepUpdate for events that affect one step,
   * or an ARRAY of SSEStepUpdate for batch events that update
   * multiple steps simultaneously.
   *
   * The returned updates are applied IN ORDER — later updates in
   * an array can override earlier ones for the same stepId within
   * the same event.
   *
   * @param event — The parsed event payload (type T).
   * @returns A single step update OR an array of step updates.
   */
  mapEvent: (event: T) => SSEStepUpdate | SSEStepUpdate[];

  /**
   * Parse the raw SSE event `data` string into your event type `T`.
   * Defaults to `JSON.parse`. Override if your server sends non-JSON
   * payloads (e.g. plain text, CSV, MessagePack decoded elsewhere).
   *
   * If parsing fails, the error handler is called and the event is
   * skipped — the step state is NOT corrupted by bad payloads.
   */
  parseEvent?: (data: string) => T;

  /**
   * SSE event name to listen for. Defaults to 'message' (the default
   * SSE event type). Set this if your server sends named events like
   * 'step-update', 'progress', etc.
   */
  eventName?: string;

  /**
   * Error handler. Called when:
   *   - EventSource emits an error event
   *   - Event parsing fails (parseEvent throws)
   *   - mapEvent throws
   *
   * If not provided, errors are silently ignored (the hook continues
   * to operate with the last good state).
   */
  onError?: (error: Error) => void;

  /**
   * Called when the connection is established (EventSource.onopen).
   * Useful for logging or resetting retry counters.
   */
  onConnect?: () => void;

  /**
   * Called when the connection is closed (intentionally or by server).
   */
  onDisconnect?: () => void;

  /**
   * Maximum number of automatic reconnection attempts after an error.
   * Default: 5. Set to 0 to disable auto-reconnection.
   *
   * Reconnections use exponential backoff: 1s, 2s, 4s, 8s, 16s.
   */
  maxRetries?: number;

  /**
   * Whether the hook should auto-connect when mounted.
   * Default: true. Set to false for manual control (call `reconnect()`).
   */
  autoConnect?: boolean;

  /**
   * Custom headers to send with the SSE request via `withCredentials`.
   * Note: EventSource API is limited — for auth, consider using
   * query parameters or cookies instead of headers.
   */
  withCredentials?: boolean;
}

/**
 * Return type of useFlowSSE.
 *
 * Provides the current step state, connection state, and control
 * functions. Feed `steps` directly to `<FlowProgress steps={steps}>`.
 */
export interface UseFlowSSEReturn<T> {
  /** Current step state array. Feed directly to FlowProgress. */
  steps: FlowProgressStep[];

  /** Current SSE connection state. */
  connectionState: SSEConnectionState;

  /** The most recent parsed event, or undefined if none received yet. */
  lastEvent: T | undefined;

  /** Number of events received since connection was established. */
  eventCount: number;

  /** Manually close the SSE connection. */
  close: () => void;

  /** Manually trigger a (re)connection. */
  reconnect: () => void;

  /**
   * Manually update a step's state. Useful for optimistic updates
   * or local-only state changes that don't come from SSE events.
   */
  updateStep: (stepId: string, updates: Partial<Pick<FlowProgressStep, 'status' | 'label' | 'type' | 'meta'>>) => void;

  /**
   * Reset all steps to their initial state and optionally reconnect.
   * Useful for "restart" scenarios.
   */
  reset: (reconnectAfterReset?: boolean) => void;
}

// ─────────────────────────────────────────────────────────────────────────
// Helper: apply updates to step array
// ─────────────────────────────────────────────────────────────────────────

/**
 * Apply a list of step updates to the current step array.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * MERGE SEMANTICS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * - Top-level step fields (status, label, type) are REPLACED.
 * - `meta` is SHALLOW-MERGED: existing keys are preserved unless the
 *   update explicitly provides the same key. This means:
 *
 *   Existing: { meta: { message: 'Downloading', progress: 0.5, x-custom: 42 } }
 *   Update:   { meta: { message: 'Done', progress: 1.0 } }
 *   Result:   { meta: { message: 'Done', progress: 1.0, x-custom: 42 } }
 *
 *   The 'x-custom' key is PRESERVED because the update didn't mention it.
 *   To remove a key, explicitly set it to undefined in the update.
 *
 * - If the update references a stepId that doesn't exist in the current
 *   array, it is SILENTLY IGNORED. This prevents crashes when the server
 *   sends events for steps that were removed or haven't been added yet.
 *
 * - The function returns a NEW array reference only if at least one step
 *   actually changed. If no steps were affected (all stepIds unknown),
 *   the original array reference is returned to avoid unnecessary renders.
 * ═══════════════════════════════════════════════════════════════════════
 */
function applyUpdates(
  currentSteps: FlowProgressStep[],
  updates: SSEStepUpdate[],
): FlowProgressStep[] {
  if (updates.length === 0) return currentSteps;

  let changed = false;

  const nextSteps = currentSteps.map(step => {
    /*
     * Find ALL updates for this step (batch events may include
     * multiple updates for the same stepId).
     */
    const matching = updates.filter(u => u.stepId === step.id);
    if (matching.length === 0) return step;

    changed = true;

    /*
     * Apply updates sequentially. Later updates override earlier ones.
     */
    let merged = step;
    for (const update of matching) {
      merged = {
        ...merged,
        ...update.updates,
        /*
         * SHALLOW-MERGE meta: preserve existing keys that aren't
         * explicitly overwritten by the update.
         */
        meta: update.updates.meta
          ? { ...(merged.meta ?? {}), ...update.updates.meta }
          : merged.meta,
      };
    }

    return merged;
  });

  return changed ? nextSteps : currentSteps;
}

// ─────────────────────────────────────────────────────────────────────────
// Hook implementation
// ─────────────────────────────────────────────────────────────────────────

/**
 * useFlowSSE — Consumes an SSE stream and maintains FlowProgressStep state.
 *
 * Generic over `T`, the shape of your SSE event payloads. See the module-
 * level JSDoc for comprehensive usage examples.
 *
 * ## LIFECYCLE
 *
 * 1. On mount (or when `url` changes): opens EventSource to `url`.
 * 2. On each SSE event: parses data → calls mapEvent → merges updates.
 * 3. On error: retries with exponential backoff up to maxRetries.
 * 4. On unmount: closes EventSource, clears all timers.
 *
 * ## REACT INTEGRATION
 *
 * Feed the returned `steps` directly to `<FlowProgress steps={steps}>`.
 * The steps array reference only changes when step data actually changes,
 * so React.memo and shouldComponentUpdate work correctly.
 */
export function useFlowSSE<T>(options: UseFlowSSEOptions<T>): UseFlowSSEReturn<T> {
  const {
    url,
    initialSteps,
    mapEvent,
    parseEvent = (data: string) => JSON.parse(data) as T,
    eventName = 'message',
    onError,
    onConnect,
    onDisconnect,
    maxRetries = 5,
    autoConnect = true,
    withCredentials = false,
  } = options;

  /*
   * Step state. Initialized from initialSteps and updated by SSE events.
   * We use a ref + state pair: the ref holds the latest value for use
   * inside callbacks (avoids stale closure issues), the state triggers
   * React re-renders.
   */
  const [steps, setSteps] = useState<FlowProgressStep[]>(initialSteps);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const [connectionState, setConnectionState] = useState<SSEConnectionState>(
    autoConnect ? 'connecting' : 'disconnected',
  );
  const [lastEvent, setLastEvent] = useState<T | undefined>(undefined);
  const [eventCount, setEventCount] = useState(0);

  /*
   * Refs for the EventSource instance and retry state.
   * Using refs instead of state because these are imperative resources
   * that don't need to trigger renders.
   */
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  /*
   * Stable references to callback props. We ref them so the effect
   * doesn't re-run when the consumer passes new arrow functions
   * (which happens on every render with inline callbacks).
   */
  const mapEventRef = useRef(mapEvent);
  mapEventRef.current = mapEvent;
  const parseEventRef = useRef(parseEvent);
  parseEventRef.current = parseEvent;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;

  /**
   * Close the current EventSource connection and clean up timers.
   */
  const closeConnection = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  /**
   * Open a new EventSource connection to the configured URL.
   *
   * This is the core connection logic. It:
   *   1. Creates an EventSource with the given URL.
   *   2. Listens for the configured event name (default: 'message').
   *   3. On each event: parse → map → merge → setState.
   *   4. On error: retry with exponential backoff.
   *   5. On open: reset retry counter, set state to 'connected'.
   */
  const openConnection = useCallback(() => {
    if (!mountedRef.current) return;

    closeConnection();
    setConnectionState('connecting');

    const es = new EventSource(url, { withCredentials });
    eventSourceRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      retryCountRef.current = 0;
      setConnectionState('connected');
      onConnectRef.current?.();
    };

    /*
     * Listen for events. The event name defaults to 'message' but can
     * be configured. We use addEventListener instead of onmessage so
     * that named events (e.g. 'step-update') work correctly.
     */
    es.addEventListener(eventName, (event: MessageEvent) => {
      if (!mountedRef.current) return;

      try {
        /*
         * Step 1: Parse the raw SSE data string into the consumer's
         * event type T. Defaults to JSON.parse but can be overridden.
         */
        const parsed = parseEventRef.current(event.data);

        /*
         * Step 2: Map the parsed event to step update(s) using the
         * consumer's mapEvent function. Can return a single update
         * or an array for batch events.
         */
        const result = mapEventRef.current(parsed);
        const updates = Array.isArray(result) ? result : [result];

        /*
         * Step 3: Apply the updates to the current step state.
         * Uses the ref to avoid stale closures.
         */
        const nextSteps = applyUpdates(stepsRef.current, updates);
        if (nextSteps !== stepsRef.current) {
          stepsRef.current = nextSteps;
          setSteps(nextSteps);
        }

        setLastEvent(parsed);
        setEventCount(c => c + 1);
      } catch (err) {
        /*
         * If parsing or mapping fails, call the error handler but
         * DON'T corrupt the step state. The last good state is preserved.
         */
        onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)));
      }
    });

    es.onerror = () => {
      if (!mountedRef.current) return;

      /*
       * EventSource error handling. The browser automatically attempts
       * to reconnect, but we implement our own retry logic for better
       * control over backoff timing and max retries.
       */
      es.close();
      eventSourceRef.current = null;

      if (retryCountRef.current < maxRetries) {
        /*
         * Exponential backoff: 1s, 2s, 4s, 8s, 16s.
         * This prevents hammering a failing server.
         */
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 16000);
        retryCountRef.current += 1;
        setConnectionState('connecting');

        retryTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            openConnection();
          }
        }, delay);
      } else {
        /*
         * Max retries exceeded. Set error state and notify consumer.
         * Consumer can call reconnect() to manually retry.
         */
        setConnectionState('error');
        onErrorRef.current?.(new Error(
          `SSE connection failed after ${maxRetries} retries to ${url}`,
        ));
      }
    };
  }, [url, eventName, withCredentials, maxRetries, closeConnection]);

  /**
   * Manually close the connection and set state to 'disconnected'.
   */
  const close = useCallback(() => {
    closeConnection();
    setConnectionState('disconnected');
    onDisconnectRef.current?.();
  }, [closeConnection]);

  /**
   * Manually trigger a (re)connection. Resets the retry counter.
   */
  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    openConnection();
  }, [openConnection]);

  /**
   * Manually update a single step. Useful for optimistic updates
   * or local-only state changes.
   */
  const updateStep = useCallback((
    stepId: string,
    updates: Partial<Pick<FlowProgressStep, 'status' | 'label' | 'type' | 'meta'>>,
  ) => {
    const nextSteps = applyUpdates(stepsRef.current, [{ stepId, updates }]);
    if (nextSteps !== stepsRef.current) {
      stepsRef.current = nextSteps;
      setSteps(nextSteps);
    }
  }, []);

  /**
   * Reset all steps to their initial state.
   */
  const reset = useCallback((reconnectAfterReset = false) => {
    closeConnection();
    stepsRef.current = initialSteps;
    setSteps(initialSteps);
    setLastEvent(undefined);
    setEventCount(0);
    retryCountRef.current = 0;
    setConnectionState('disconnected');

    if (reconnectAfterReset) {
      openConnection();
    }
  }, [initialSteps, closeConnection, openConnection]);

  /*
   * Effect: auto-connect on mount and reconnect when URL changes.
   * Clean up on unmount.
   */
  useEffect(() => {
    mountedRef.current = true;

    if (autoConnect) {
      openConnection();
    }

    return () => {
      mountedRef.current = false;
      closeConnection();
    };
  }, [url, autoConnect, openConnection, closeConnection]);

  return {
    steps,
    connectionState,
    lastEvent,
    eventCount,
    close,
    reconnect,
    updateStep,
    reset,
  };
}
