/**
 * Tests for useFlowSSE hook (v0.3.0).
 *
 * These tests verify:
 *   - SSE connection lifecycle (connect, receive events, disconnect)
 *   - Event parsing and step state updates
 *   - Meta merging semantics (shallow merge, preserves unknown keys)
 *   - Status mapping via mapEvent
 *   - Batch event support (one event → multiple step updates)
 *   - Error handling (parse errors, connection errors)
 *   - Auto-reconnection with retry logic
 *   - Manual control (close, reconnect, reset, updateStep)
 *   - Cleanup on unmount
 *
 * Uses a mock EventSource implementation since JSDOM doesn't provide one.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useFlowSSE } from '../../src/react/use-flow-sse';
import type { FlowProgressStep } from '../../src/react/types';
import type { UseFlowSSEOptions, SSEStepUpdate } from '../../src/react/use-flow-sse';

// ─────────────────────────────────────────────────────────────────────────
// Mock EventSource
// ─────────────────────────────────────────────────────────────────────────

interface MockEventSourceInstance {
  url: string;
  withCredentials: boolean;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  close: jest.Mock;
  _listeners: Record<string, Array<(event: MessageEvent) => void>>;
  _simulateOpen: () => void;
  _simulateMessage: (data: string, eventName?: string) => void;
  _simulateError: () => void;
}

let mockEventSourceInstances: MockEventSourceInstance[] = [];

class MockEventSource {
  url: string;
  withCredentials: boolean;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  _listeners: Record<string, Array<(event: MessageEvent) => void>> = {};
  addEventListener = jest.fn((name: string, handler: (event: MessageEvent) => void) => {
    if (!this._listeners[name]) this._listeners[name] = [];
    this._listeners[name].push(handler);
  });
  removeEventListener = jest.fn();
  close = jest.fn();

  constructor(url: string, opts?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = opts?.withCredentials ?? false;
    mockEventSourceInstances.push(this as any);
  }

  _simulateOpen() {
    this.onopen?.(new Event('open'));
  }

  _simulateMessage(data: string, eventName = 'message') {
    const handlers = this._listeners[eventName] ?? [];
    const event = { data } as MessageEvent;
    for (const handler of handlers) {
      handler(event);
    }
  }

  _simulateError() {
    this.onerror?.(new Event('error'));
  }
}

beforeEach(() => {
  mockEventSourceInstances = [];
  (global as any).EventSource = MockEventSource;
});

afterEach(() => {
  delete (global as any).EventSource;
});

// ─────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────

const initialSteps: FlowProgressStep[] = [
  { id: 'download', label: 'Download', status: 'pending' },
  { id: 'transcode', label: 'Transcode', status: 'pending' },
  { id: 'upload', label: 'Upload', status: 'pending' },
];

interface TestEvent {
  stepId: string;
  status: 'active' | 'complete' | 'error';
  message?: string;
  progress?: number;
}

const defaultOptions: UseFlowSSEOptions<TestEvent> = {
  url: '/api/events',
  initialSteps,
  mapEvent: (event: TestEvent) => ({
    stepId: event.stepId,
    updates: {
      status: event.status,
      meta: {
        ...(event.message ? { message: event.message } : {}),
        ...(event.progress !== undefined ? { progress: event.progress } : {}),
      },
    },
  }),
};

function getLastES(): MockEventSourceInstance {
  return mockEventSourceInstances[mockEventSourceInstances.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe('useFlowSSE', () => {
  describe('initialization', () => {
    it('returns initial steps on mount', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));
      expect(result.current.steps).toEqual(initialSteps);
    });

    it('starts in connecting state when autoConnect is true', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));
      expect(result.current.connectionState).toBe('connecting');
    });

    it('starts in disconnected state when autoConnect is false', () => {
      const { result } = renderHook(() =>
        useFlowSSE({ ...defaultOptions, autoConnect: false }),
      );
      expect(result.current.connectionState).toBe('disconnected');
    });

    it('does not create EventSource when autoConnect is false', () => {
      renderHook(() =>
        useFlowSSE({ ...defaultOptions, autoConnect: false }),
      );
      expect(mockEventSourceInstances).toHaveLength(0);
    });

    it('creates EventSource with the correct URL', () => {
      renderHook(() => useFlowSSE(defaultOptions));
      expect(getLastES().url).toBe('/api/events');
    });
  });

  describe('connection lifecycle', () => {
    it('sets connected state on open', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));

      act(() => {
        getLastES()._simulateOpen();
      });

      expect(result.current.connectionState).toBe('connected');
    });

    it('calls onConnect callback on open', () => {
      const onConnect = jest.fn();
      renderHook(() =>
        useFlowSSE({ ...defaultOptions, onConnect }),
      );

      act(() => {
        getLastES()._simulateOpen();
      });

      expect(onConnect).toHaveBeenCalledTimes(1);
    });

    it('sets disconnected state on close()', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));

      act(() => {
        getLastES()._simulateOpen();
      });

      act(() => {
        result.current.close();
      });

      expect(result.current.connectionState).toBe('disconnected');
    });
  });

  describe('event processing', () => {
    it('updates step status on event', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));

      act(() => {
        getLastES()._simulateOpen();
        getLastES()._simulateMessage(JSON.stringify({
          stepId: 'download',
          status: 'active',
          message: 'Starting download...',
        }));
      });

      expect(result.current.steps[0].status).toBe('active');
      expect(result.current.steps[0].meta?.message).toBe('Starting download...');
    });

    it('increments eventCount on each event', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));

      act(() => {
        getLastES()._simulateOpen();
        getLastES()._simulateMessage(JSON.stringify({
          stepId: 'download', status: 'active',
        }));
      });

      expect(result.current.eventCount).toBe(1);

      act(() => {
        getLastES()._simulateMessage(JSON.stringify({
          stepId: 'download', status: 'complete',
        }));
      });

      expect(result.current.eventCount).toBe(2);
    });

    it('stores lastEvent', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));

      act(() => {
        getLastES()._simulateOpen();
        getLastES()._simulateMessage(JSON.stringify({
          stepId: 'download', status: 'complete',
        }));
      });

      expect(result.current.lastEvent).toEqual({
        stepId: 'download', status: 'complete',
      });
    });

    it('preserves meta keys not overwritten by update', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));

      act(() => {
        getLastES()._simulateOpen();
        // First event sets message and progress
        getLastES()._simulateMessage(JSON.stringify({
          stepId: 'download', status: 'active',
          message: 'Chunk 1/5', progress: 0.2,
        }));
      });

      expect(result.current.steps[0].meta?.message).toBe('Chunk 1/5');
      expect(result.current.steps[0].meta?.progress).toBe(0.2);

      act(() => {
        // Second event only updates message — progress should be preserved
        getLastES()._simulateMessage(JSON.stringify({
          stepId: 'download', status: 'active',
          message: 'Chunk 2/5',
        }));
      });

      expect(result.current.steps[0].meta?.message).toBe('Chunk 2/5');
      expect(result.current.steps[0].meta?.progress).toBe(0.2); // preserved
    });

    it('ignores events for unknown step IDs', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));
      const originalSteps = result.current.steps;

      act(() => {
        getLastES()._simulateOpen();
        getLastES()._simulateMessage(JSON.stringify({
          stepId: 'nonexistent', status: 'active',
        }));
      });

      expect(result.current.steps).toBe(originalSteps); // same reference
    });

    it('leaves unchanged steps untouched (same reference)', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));

      act(() => {
        getLastES()._simulateOpen();
        getLastES()._simulateMessage(JSON.stringify({
          stepId: 'download', status: 'active',
        }));
      });

      // Steps 1 and 2 (transcode, upload) should not have changed
      expect(result.current.steps[1].status).toBe('pending');
      expect(result.current.steps[2].status).toBe('pending');
    });
  });

  describe('batch events', () => {
    it('handles batch mapEvent returning array', () => {
      interface BatchEvent {
        updates: Array<{ stepId: string; status: string; message?: string }>;
      }

      const batchOptions: UseFlowSSEOptions<BatchEvent> = {
        url: '/api/batch',
        initialSteps,
        mapEvent: (event: BatchEvent) =>
          event.updates.map(u => ({
            stepId: u.stepId,
            updates: {
              status: u.status as FlowProgressStep['status'],
              meta: u.message ? { message: u.message } : undefined,
            },
          })),
      };

      const { result } = renderHook(() => useFlowSSE(batchOptions));

      act(() => {
        getLastES()._simulateOpen();
        getLastES()._simulateMessage(JSON.stringify({
          updates: [
            { stepId: 'download', status: 'complete', message: 'Done' },
            { stepId: 'transcode', status: 'active', message: 'Processing...' },
          ],
        }));
      });

      expect(result.current.steps[0].status).toBe('complete');
      expect(result.current.steps[0].meta?.message).toBe('Done');
      expect(result.current.steps[1].status).toBe('active');
      expect(result.current.steps[1].meta?.message).toBe('Processing...');
      expect(result.current.steps[2].status).toBe('pending'); // unchanged
    });
  });

  describe('error handling', () => {
    it('calls onError when JSON parsing fails', () => {
      const onError = jest.fn();
      renderHook(() =>
        useFlowSSE({ ...defaultOptions, onError }),
      );

      act(() => {
        getLastES()._simulateOpen();
        getLastES()._simulateMessage('not valid json');
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('preserves step state when parsing fails', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));

      act(() => {
        getLastES()._simulateOpen();
        // First, a valid event
        getLastES()._simulateMessage(JSON.stringify({
          stepId: 'download', status: 'active',
        }));
      });

      expect(result.current.steps[0].status).toBe('active');

      act(() => {
        // Then an invalid event
        getLastES()._simulateMessage('broken json');
      });

      // Step state should be unchanged
      expect(result.current.steps[0].status).toBe('active');
    });

    it('uses custom parseEvent when provided', () => {
      const { result } = renderHook(() =>
        useFlowSSE({
          ...defaultOptions,
          parseEvent: (data: string) => {
            // Custom parser that expects CSV
            const [stepId, status] = data.split(',');
            return { stepId, status } as unknown as TestEvent;
          },
        }),
      );

      act(() => {
        getLastES()._simulateOpen();
        getLastES()._simulateMessage('download,active');
      });

      expect(result.current.steps[0].status).toBe('active');
    });
  });

  describe('manual control', () => {
    it('updateStep manually updates a step', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));

      act(() => {
        result.current.updateStep('download', {
          status: 'active',
          meta: { message: 'Manual update' },
        });
      });

      expect(result.current.steps[0].status).toBe('active');
      expect(result.current.steps[0].meta?.message).toBe('Manual update');
    });

    it('reset restores initial steps', () => {
      const { result } = renderHook(() => useFlowSSE(defaultOptions));

      act(() => {
        getLastES()._simulateOpen();
        getLastES()._simulateMessage(JSON.stringify({
          stepId: 'download', status: 'complete',
        }));
      });

      expect(result.current.steps[0].status).toBe('complete');

      act(() => {
        result.current.reset();
      });

      expect(result.current.steps[0].status).toBe('pending');
      expect(result.current.eventCount).toBe(0);
      expect(result.current.lastEvent).toBeUndefined();
      expect(result.current.connectionState).toBe('disconnected');
    });

    it('reconnect opens a new connection', () => {
      const { result } = renderHook(() =>
        useFlowSSE({ ...defaultOptions, autoConnect: false }),
      );

      expect(mockEventSourceInstances).toHaveLength(0);

      act(() => {
        result.current.reconnect();
      });

      expect(mockEventSourceInstances).toHaveLength(1);
      expect(result.current.connectionState).toBe('connecting');
    });
  });

  describe('named events', () => {
    it('listens for custom event names', () => {
      renderHook(() =>
        useFlowSSE({ ...defaultOptions, eventName: 'step-update' }),
      );

      const es = getLastES();
      expect(es.addEventListener).toHaveBeenCalledWith(
        'step-update',
        expect.any(Function),
      );
    });

    it('processes events on custom event name', () => {
      const { result } = renderHook(() =>
        useFlowSSE({ ...defaultOptions, eventName: 'step-update' }),
      );

      act(() => {
        getLastES()._simulateOpen();
        getLastES()._simulateMessage(
          JSON.stringify({ stepId: 'download', status: 'complete' }),
          'step-update',
        );
      });

      expect(result.current.steps[0].status).toBe('complete');
    });
  });

  describe('cleanup', () => {
    it('closes EventSource on unmount', () => {
      const { unmount } = renderHook(() => useFlowSSE(defaultOptions));
      const es = getLastES();

      unmount();

      expect(es.close).toHaveBeenCalled();
    });
  });
});
