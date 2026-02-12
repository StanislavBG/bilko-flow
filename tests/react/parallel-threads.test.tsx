import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FlowProgress } from '../../src/react/flow-progress';
import { ParallelThreadsSection, MAX_PARALLEL_THREADS } from '../../src/react/parallel-threads';
import { DEFAULT_FLOW_PROGRESS_THEME } from '../../src/react/step-type-config';
import type { ParallelThread, FlowProgressStep } from '../../src/react/types';

// ─────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────

const mainSteps: FlowProgressStep[] = [
  { id: 'init', label: 'Initialize', status: 'complete' },
];

const twoThreads: ParallelThread[] = [
  {
    id: 'google',
    label: 'Google Search',
    status: 'running',
    steps: [
      { id: 'g1', label: 'Query', status: 'complete', type: 'http.search' },
      { id: 'g2', label: 'Parse', status: 'active', type: 'transform.map' },
    ],
    activity: 'Parsing results...',
  },
  {
    id: 'bing',
    label: 'Bing Search',
    status: 'running',
    steps: [
      { id: 'b1', label: 'Query', status: 'active', type: 'http.search' },
    ],
  },
];

const threeThreads: ParallelThread[] = [
  ...twoThreads,
  {
    id: 'arxiv',
    label: 'ArXiv Search',
    status: 'pending',
    steps: [
      { id: 'a1', label: 'Query', status: 'pending', type: 'http.search' },
      { id: 'a2', label: 'Filter', status: 'pending', type: 'transform.filter' },
    ],
  },
];

const fiveThreads: ParallelThread[] = [
  ...threeThreads,
  {
    id: 'pubmed',
    label: 'PubMed Search',
    status: 'running',
    steps: [
      { id: 'p1', label: 'Query', status: 'active', type: 'http.search' },
    ],
  },
  {
    id: 'semantic',
    label: 'Semantic Scholar',
    status: 'complete',
    steps: [
      { id: 's1', label: 'Query', status: 'complete', type: 'http.search' },
      { id: 's2', label: 'Rank', status: 'complete', type: 'ai.summarize' },
    ],
  },
];

const sixThreads: ParallelThread[] = [
  ...fiveThreads,
  {
    id: 'overflow',
    label: 'Overflow Thread',
    status: 'pending',
    steps: [
      { id: 'o1', label: 'Step 1', status: 'pending' },
    ],
  },
];

const completedThreads: ParallelThread[] = [
  {
    id: 'done1',
    label: 'Thread A',
    status: 'complete',
    steps: [
      { id: 'd1', label: 'Step 1', status: 'complete' },
      { id: 'd2', label: 'Step 2', status: 'complete' },
    ],
  },
  {
    id: 'done2',
    label: 'Thread B',
    status: 'complete',
    steps: [
      { id: 'd3', label: 'Step 1', status: 'complete' },
    ],
  },
];

const errorThread: ParallelThread[] = [
  {
    id: 'err',
    label: 'Failed Thread',
    status: 'error',
    steps: [
      { id: 'e1', label: 'Query', status: 'complete', type: 'http.search' },
      { id: 'e2', label: 'Parse', status: 'error', type: 'transform.map' },
    ],
    error: 'Connection timeout',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe('ParallelThreadsSection', () => {
  describe('constants', () => {
    it('exports MAX_PARALLEL_THREADS as 5', () => {
      expect(MAX_PARALLEL_THREADS).toBe(5);
    });
  });

  describe('rendering', () => {
    it('renders fork indicator with thread count', () => {
      render(
        <ParallelThreadsSection
          threads={twoThreads}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByTestId('parallel-fork')).toBeInTheDocument();
      expect(screen.getByText('2 threads')).toBeInTheDocument();
    });

    it('renders singular "thread" for 1 thread', () => {
      render(
        <ParallelThreadsSection
          threads={[twoThreads[0]]}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByText('1 thread')).toBeInTheDocument();
    });

    it('renders thread lanes container', () => {
      render(
        <ParallelThreadsSection
          threads={twoThreads}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByTestId('parallel-thread-lanes')).toBeInTheDocument();
    });

    it('renders each thread row', () => {
      render(
        <ParallelThreadsSection
          threads={threeThreads}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByTestId('thread-row-google')).toBeInTheDocument();
      expect(screen.getByTestId('thread-row-bing')).toBeInTheDocument();
      expect(screen.getByTestId('thread-row-arxiv')).toBeInTheDocument();
    });

    it('shows thread labels', () => {
      render(
        <ParallelThreadsSection
          threads={twoThreads}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByText('Google Search')).toBeInTheDocument();
      expect(screen.getByText('Bing Search')).toBeInTheDocument();
    });

    it('shows step counts per thread', () => {
      render(
        <ParallelThreadsSection
          threads={twoThreads}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByText('1/2')).toBeInTheDocument(); // Google: 1 complete of 2
      expect(screen.getByText('0/1')).toBeInTheDocument(); // Bing: 0 complete of 1
    });

    it('renders 5 threads simultaneously', () => {
      render(
        <ParallelThreadsSection
          threads={fiveThreads}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByTestId('thread-row-google')).toBeInTheDocument();
      expect(screen.getByTestId('thread-row-bing')).toBeInTheDocument();
      expect(screen.getByTestId('thread-row-arxiv')).toBeInTheDocument();
      expect(screen.getByTestId('thread-row-pubmed')).toBeInTheDocument();
      expect(screen.getByTestId('thread-row-semantic')).toBeInTheDocument();
    });
  });

  describe('overflow protection', () => {
    it('shows overflow indicator when threads > maxVisible', () => {
      render(
        <ParallelThreadsSection
          threads={sixThreads}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByTestId('parallel-overflow')).toBeInTheDocument();
      expect(screen.getByText('+1 more thread')).toBeInTheDocument();
    });

    it('does not render threads beyond maxVisible', () => {
      render(
        <ParallelThreadsSection
          threads={sixThreads}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.queryByTestId('thread-row-overflow')).not.toBeInTheDocument();
    });

    it('respects custom maxVisible in config', () => {
      render(
        <ParallelThreadsSection
          threads={threeThreads}
          config={{ maxVisible: 2 }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByTestId('thread-row-google')).toBeInTheDocument();
      expect(screen.getByTestId('thread-row-bing')).toBeInTheDocument();
      expect(screen.queryByTestId('thread-row-arxiv')).not.toBeInTheDocument();
      expect(screen.getByText('+1 more thread')).toBeInTheDocument();
    });

    it('clamps maxVisible to MAX_PARALLEL_THREADS (5)', () => {
      // Even with maxVisible: 10, only 5 should render
      const sevenThreads: ParallelThread[] = Array.from({ length: 7 }, (_, i) => ({
        id: `t${i}`,
        label: `Thread ${i}`,
        status: 'running' as const,
        steps: [{ id: `t${i}s1`, label: 'Step', status: 'active' as const }],
      }));

      render(
        <ParallelThreadsSection
          threads={sevenThreads}
          config={{ maxVisible: 10 }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByText('+2 more threads')).toBeInTheDocument();
    });

    it('uses plural form for overflow count > 1', () => {
      const eightThreads: ParallelThread[] = Array.from({ length: 8 }, (_, i) => ({
        id: `t${i}`,
        label: `Thread ${i}`,
        status: 'running' as const,
        steps: [{ id: `t${i}s1`, label: 'Step', status: 'active' as const }],
      }));

      render(
        <ParallelThreadsSection
          threads={eightThreads}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByText('+3 more threads')).toBeInTheDocument();
    });
  });

  describe('collapse/expand', () => {
    it('threads start expanded by default', () => {
      render(
        <ParallelThreadsSection
          threads={twoThreads}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      // Thread steps should be visible — "Query" appears in both threads
      const queryElements = screen.getAllByText('Query');
      expect(queryElements.length).toBe(2); // One per thread
      expect(screen.getByText('Parse')).toBeInTheDocument();
    });

    it('toggles thread collapse on click', () => {
      render(
        <ParallelThreadsSection
          threads={twoThreads}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      // Click to collapse the first thread
      const collapseButton = screen.getByLabelText('Collapse thread: Google Search');
      fireEvent.click(collapseButton);

      // Steps should be hidden now
      // (Note: "Query" also appears in Bing thread but only as one step)
      const expandButton = screen.getByLabelText('Expand thread: Google Search');
      expect(expandButton).toBeInTheDocument();
    });

    it('calls onThreadToggle callback', () => {
      const onToggle = jest.fn();

      render(
        <ParallelThreadsSection
          threads={twoThreads}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
          onThreadToggle={onToggle}
        />,
      );

      fireEvent.click(screen.getByLabelText('Collapse thread: Google Search'));
      expect(onToggle).toHaveBeenCalledWith('google', true);
    });

    it('auto-collapses completed threads after delay', () => {
      jest.useFakeTimers();

      const onToggle = jest.fn();

      render(
        <ParallelThreadsSection
          threads={completedThreads}
          config={{ autoCollapseCompleted: true, autoCollapseDelayMs: 1000 }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
          onThreadToggle={onToggle}
        />,
      );

      // Before timer fires, threads should be expanded
      expect(screen.getByLabelText('Collapse thread: Thread A')).toBeInTheDocument();

      // Advance timer
      act(() => {
        jest.advanceTimersByTime(1100);
      });

      // After timer, threads should be collapsed
      expect(screen.getByLabelText('Expand thread: Thread A')).toBeInTheDocument();

      jest.useRealTimers();
    });

    it('does not auto-collapse error threads', () => {
      jest.useFakeTimers();

      render(
        <ParallelThreadsSection
          threads={errorThread}
          config={{ autoCollapseCompleted: true, autoCollapseDelayMs: 500 }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Error thread should still be expanded
      expect(screen.getByLabelText('Collapse thread: Failed Thread')).toBeInTheDocument();

      jest.useRealTimers();
    });

    it('shows error message for error threads', () => {
      render(
        <ParallelThreadsSection
          threads={errorThread}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByText('Connection timeout')).toBeInTheDocument();
    });

    it('shows thread activity text', () => {
      render(
        <ParallelThreadsSection
          threads={twoThreads}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByText('Parsing results...')).toBeInTheDocument();
    });
  });

  describe('join indicator', () => {
    it('shows join indicator when all threads complete', () => {
      render(
        <ParallelThreadsSection
          threads={completedThreads}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByTestId('parallel-join')).toBeInTheDocument();
    });

    it('shows join indicator when any thread has error', () => {
      render(
        <ParallelThreadsSection
          threads={errorThread}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.getByTestId('parallel-join')).toBeInTheDocument();
    });

    it('does not show join indicator when threads are still running', () => {
      render(
        <ParallelThreadsSection
          threads={twoThreads}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
        />,
      );

      expect(screen.queryByTestId('parallel-join')).not.toBeInTheDocument();
    });
  });

  describe('compact mode', () => {
    it('renders compact thread rows', () => {
      render(
        <ParallelThreadsSection
          threads={twoThreads}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="compact"
        />,
      );

      expect(screen.getByTestId('thread-row-google')).toBeInTheDocument();
      expect(screen.getByTestId('thread-row-bing')).toBeInTheDocument();
    });

    it('does not show thread count text in compact mode', () => {
      render(
        <ParallelThreadsSection
          threads={twoThreads}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="compact"
        />,
      );

      expect(screen.queryByText('2 threads')).not.toBeInTheDocument();
    });

    it('toggles compact thread rows', () => {
      render(
        <ParallelThreadsSection
          threads={twoThreads}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="compact"
        />,
      );

      fireEvent.click(screen.getByLabelText('Collapse thread: Google Search'));
      expect(screen.getByLabelText('Expand thread: Google Search')).toBeInTheDocument();
    });
  });

  describe('step click propagation', () => {
    it('passes onStepClick through to thread steps (expanded)', () => {
      const onStepClick = jest.fn();

      render(
        <ParallelThreadsSection
          threads={twoThreads}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="expanded"
          onStepClick={onStepClick}
        />,
      );

      fireEvent.click(screen.getByLabelText('Thread Google Search, Step: Parse'));
      expect(onStepClick).toHaveBeenCalledWith('g2');
    });

    it('passes onStepClick through to thread steps (compact)', () => {
      const onStepClick = jest.fn();

      render(
        <ParallelThreadsSection
          threads={[{
            id: 'single',
            label: 'Thread',
            status: 'running',
            steps: [{ id: 'only-step', label: 'Only Step', status: 'active' }],
          }]}
          config={{ autoCollapseCompleted: false }}
          theme={DEFAULT_FLOW_PROGRESS_THEME}
          mode="compact"
          onStepClick={onStepClick}
        />,
      );

      fireEvent.click(screen.getByText('Only Step'));
      expect(onStepClick).toHaveBeenCalledWith('only-step');
    });
  });
});

describe('FlowProgress with parallel threads', () => {
  describe('expanded mode', () => {
    it('renders parallel section when parallelThreads provided', () => {
      render(
        <FlowProgress
          mode="expanded"
          steps={mainSteps}
          parallelThreads={twoThreads}
          parallelConfig={{ autoCollapseCompleted: false }}
          status="running"
          label="Test Flow"
        />,
      );

      expect(screen.getByTestId('parallel-section')).toBeInTheDocument();
      expect(screen.getByTestId('parallel-fork')).toBeInTheDocument();
    });

    it('renders main steps AND parallel threads together', () => {
      render(
        <FlowProgress
          mode="expanded"
          steps={mainSteps}
          parallelThreads={twoThreads}
          parallelConfig={{ autoCollapseCompleted: false }}
          status="running"
        />,
      );

      // Main step
      expect(screen.getByLabelText('Step 1: Initialize')).toBeInTheDocument();
      // Thread labels
      expect(screen.getByText('Google Search')).toBeInTheDocument();
      expect(screen.getByText('Bing Search')).toBeInTheDocument();
    });

    it('does not render parallel section when parallelThreads is empty', () => {
      render(
        <FlowProgress
          mode="expanded"
          steps={mainSteps}
          parallelThreads={[]}
          status="running"
        />,
      );

      expect(screen.queryByTestId('parallel-section')).not.toBeInTheDocument();
    });

    it('does not render parallel section when parallelThreads not provided', () => {
      render(
        <FlowProgress
          mode="expanded"
          steps={mainSteps}
          status="running"
        />,
      );

      expect(screen.queryByTestId('parallel-section')).not.toBeInTheDocument();
    });
  });

  describe('full mode', () => {
    it('renders parallel section in full mode', () => {
      render(
        <FlowProgress
          mode="full"
          steps={mainSteps}
          parallelThreads={threeThreads}
          parallelConfig={{ autoCollapseCompleted: false }}
          status="running"
          label="Full Mode Test"
        />,
      );

      expect(screen.getByTestId('parallel-section')).toBeInTheDocument();
      expect(screen.getByText('3 threads')).toBeInTheDocument();
    });
  });

  describe('compact mode', () => {
    it('renders parallel section in compact mode', () => {
      render(
        <FlowProgress
          mode="compact"
          steps={mainSteps}
          parallelThreads={twoThreads}
          parallelConfig={{ autoCollapseCompleted: false }}
          status="running"
        />,
      );

      expect(screen.getByTestId('parallel-section')).toBeInTheDocument();
    });
  });

  describe('onThreadToggle callback', () => {
    it('calls onThreadToggle when thread is toggled via FlowProgress', () => {
      const onToggle = jest.fn();

      render(
        <FlowProgress
          mode="expanded"
          steps={mainSteps}
          parallelThreads={twoThreads}
          parallelConfig={{ autoCollapseCompleted: false }}
          onThreadToggle={onToggle}
          status="running"
        />,
      );

      fireEvent.click(screen.getByLabelText('Collapse thread: Google Search'));
      expect(onToggle).toHaveBeenCalledWith('google', true);
    });
  });

  describe('5-thread maximum', () => {
    it('renders all 5 threads when exactly 5 provided', () => {
      render(
        <FlowProgress
          mode="expanded"
          steps={mainSteps}
          parallelThreads={fiveThreads}
          parallelConfig={{ autoCollapseCompleted: false }}
          status="running"
        />,
      );

      expect(screen.getByTestId('thread-row-google')).toBeInTheDocument();
      expect(screen.getByTestId('thread-row-bing')).toBeInTheDocument();
      expect(screen.getByTestId('thread-row-arxiv')).toBeInTheDocument();
      expect(screen.getByTestId('thread-row-pubmed')).toBeInTheDocument();
      expect(screen.getByTestId('thread-row-semantic')).toBeInTheDocument();
      expect(screen.queryByTestId('parallel-overflow')).not.toBeInTheDocument();
    });

    it('shows overflow for 6+ threads', () => {
      render(
        <FlowProgress
          mode="expanded"
          steps={mainSteps}
          parallelThreads={sixThreads}
          parallelConfig={{ autoCollapseCompleted: false }}
          status="running"
        />,
      );

      expect(screen.getByTestId('parallel-overflow')).toBeInTheDocument();
      expect(screen.getByText('+1 more thread')).toBeInTheDocument();
    });
  });
});
