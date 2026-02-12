import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FlowProgress, adaptSteps } from '../../src/react/flow-progress';
import type { FlowProgressStep, FlowProgressTheme } from '../../src/react/types';
import { DEFAULT_FLOW_PROGRESS_THEME } from '../../src/react/step-type-config';

const mockSteps: FlowProgressStep[] = [
  { id: '1', label: 'Discover', status: 'complete' },
  { id: '2', label: 'Write', status: 'active' },
  { id: '3', label: 'Publish', status: 'pending' },
];

const typedSteps: FlowProgressStep[] = [
  { id: '1', label: 'Search', status: 'complete', type: 'http.search' },
  { id: '2', label: 'Summarize', status: 'active', type: 'ai.summarize' },
  { id: '3', label: 'Transform', status: 'pending', type: 'transform.map' },
];

describe('FlowProgress', () => {
  describe('full mode', () => {
    it('renders all step labels', () => {
      render(
        <FlowProgress mode="full" steps={mockSteps} label="Test Flow" status="running" />,
      );

      expect(screen.getByText('Discover')).toBeInTheDocument();
      expect(screen.getByText('Write')).toBeInTheDocument();
      expect(screen.getByText('Publish')).toBeInTheDocument();
    });

    it('renders flow label', () => {
      render(
        <FlowProgress mode="full" steps={mockSteps} label="My Pipeline" status="running" />,
      );

      expect(screen.getByText('My Pipeline')).toBeInTheDocument();
    });

    it('shows completed/total counter', () => {
      render(
        <FlowProgress mode="full" steps={mockSteps} status="running" />,
      );

      expect(screen.getByText('1/3')).toBeInTheDocument();
    });

    it('shows activity text when provided', () => {
      render(
        <FlowProgress
          mode="full"
          steps={mockSteps}
          status="running"
          activity="Writing article draft..."
        />,
      );

      expect(screen.getByText('Writing article draft...')).toBeInTheDocument();
    });

    it('renders reset button when onReset provided', () => {
      const onReset = jest.fn();
      render(
        <FlowProgress mode="full" steps={mockSteps} status="running" onReset={onReset} />,
      );

      const resetButton = screen.getByRole('button', { name: /reset/i });
      expect(resetButton).toBeInTheDocument();

      fireEvent.click(resetButton);
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('does not render reset button when onReset not provided', () => {
      render(
        <FlowProgress mode="full" steps={mockSteps} status="running" />,
      );

      expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
    });

    it('displays pending step numbers', () => {
      render(
        <FlowProgress
          mode="full"
          steps={[
            { id: '1', label: 'Step A', status: 'pending' },
            { id: '2', label: 'Step B', status: 'pending' },
          ]}
          status="idle"
        />,
      );

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('calls onStepClick when a step is clicked', () => {
      const onStepClick = jest.fn();
      render(
        <FlowProgress
          mode="full"
          steps={mockSteps}
          status="running"
          onStepClick={onStepClick}
        />,
      );

      fireEvent.click(screen.getByText('Write'));
      expect(onStepClick).toHaveBeenCalledWith('2');
    });

    it('renders segmented progress track bar', () => {
      const { container } = render(
        <FlowProgress mode="full" steps={mockSteps} status="running" />,
      );

      // Progress track should exist with segments
      const progressBar = container.querySelector('[data-testid="progress-bar"]');
      expect(progressBar).toBeInTheDocument();
      // Should have one segment per step
      expect(progressBar!.children.length).toBe(3);
    });

    it('renders status dot with theme color', () => {
      const { container } = render(
        <FlowProgress mode="full" steps={mockSteps} status="running" />,
      );

      const statusDot = container.querySelector('[data-testid="status-dot"]');
      expect(statusDot).toBeInTheDocument();
      expect(statusDot!.className).toContain('animate-pulse');
    });
  });

  describe('compact mode', () => {
    it('renders all step labels', () => {
      render(
        <FlowProgress mode="compact" steps={mockSteps} status="running" />,
      );

      expect(screen.getByText('Discover')).toBeInTheDocument();
      expect(screen.getByText('Write')).toBeInTheDocument();
      expect(screen.getByText('Publish')).toBeInTheDocument();
    });

    it('shows activity text', () => {
      render(
        <FlowProgress
          mode="compact"
          steps={mockSteps}
          status="running"
          activity="Processing..."
        />,
      );

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('shows last result when provided', () => {
      render(
        <FlowProgress
          mode="compact"
          steps={mockSteps}
          status="running"
          lastResult="Generated 5 articles"
        />,
      );

      expect(screen.getByText('Generated 5 articles')).toBeInTheDocument();
    });

    it('calls onStepClick when a step is clicked', () => {
      const onStepClick = jest.fn();
      render(
        <FlowProgress
          mode="compact"
          steps={mockSteps}
          status="running"
          onStepClick={onStepClick}
        />,
      );

      fireEvent.click(screen.getByText('Write'));
      expect(onStepClick).toHaveBeenCalledWith('2');
    });

    it('shows progress counter (X of N)', () => {
      const { container } = render(
        <FlowProgress mode="compact" steps={mockSteps} status="running" />,
      );

      const counter = container.querySelector('[data-testid="progress-counter"]');
      expect(counter).toBeInTheDocument();
      expect(screen.getByText('1 of 3')).toBeInTheDocument();
    });

    it('does not show progress counter for empty steps', () => {
      const { container } = render(
        <FlowProgress mode="compact" steps={[]} status="idle" />,
      );

      const counter = container.querySelector('[data-testid="progress-counter"]');
      expect(counter).not.toBeInTheDocument();
    });
  });

  describe('sliding window', () => {
    // 8 steps > 2*2+3=7, so sliding window activates
    const manySteps: FlowProgressStep[] = Array.from({ length: 12 }, (_, i) => ({
      id: `s${i + 1}`,
      label: `Step ${i + 1}`,
      status: i < 5 ? 'complete' as const : i === 5 ? 'active' as const : 'pending' as const,
    }));

    it('shows ellipsis markers for many steps in full mode', () => {
      render(
        <FlowProgress mode="full" steps={manySteps} status="running" />,
      );

      // Should show ellipsis button(s) for hidden steps
      const ellipsisButtons = screen.getAllByLabelText(/hidden steps/);
      expect(ellipsisButtons.length).toBeGreaterThan(0);
    });

    it('shows ellipsis markers for many steps in compact mode', () => {
      render(
        <FlowProgress mode="compact" steps={manySteps} status="running" />,
      );

      const ellipsisButtons = screen.getAllByLabelText(/hidden steps/);
      expect(ellipsisButtons.length).toBeGreaterThan(0);
    });

    it('always shows first and last steps', () => {
      render(
        <FlowProgress mode="full" steps={manySteps} status="running" />,
      );

      // First step
      expect(screen.getByLabelText(/Step 1: Step 1/)).toBeInTheDocument();
      // Last step
      expect(screen.getByLabelText(/Step 12: Step 12/)).toBeInTheDocument();
    });

    it('always shows the active step', () => {
      render(
        <FlowProgress mode="full" steps={manySteps} status="running" />,
      );

      // Active step (index 5, so Step 6) should be visible
      expect(screen.getByLabelText(/Step 6: Step 6/)).toBeInTheDocument();
    });

    it('opens ellipsis dropdown on click', () => {
      render(
        <FlowProgress mode="full" steps={manySteps} status="running" />,
      );

      const ellipsisButton = screen.getAllByLabelText(/hidden steps/)[0];
      fireEvent.click(ellipsisButton);

      const dropdown = document.querySelector('.max-h-\\[200px\\]');
      expect(dropdown).toBeInTheDocument();
    });

    it('does not show ellipsis for 7 or fewer steps', () => {
      const fewSteps: FlowProgressStep[] = Array.from({ length: 7 }, (_, i) => ({
        id: `s${i + 1}`,
        label: `Step ${i + 1}`,
        status: i === 3 ? 'active' as const : 'pending' as const,
      }));

      render(
        <FlowProgress mode="full" steps={fewSteps} status="running" />,
      );

      expect(screen.queryByLabelText(/hidden steps/)).not.toBeInTheDocument();
    });

    it('respects custom radius prop', () => {
      // With radius=1, window activates at > 2*1+3 = 5 steps
      const sixSteps: FlowProgressStep[] = Array.from({ length: 6 }, (_, i) => ({
        id: `s${i + 1}`,
        label: `Step ${i + 1}`,
        status: i === 2 ? 'active' as const : 'pending' as const,
      }));

      render(
        <FlowProgress mode="full" steps={sixSteps} status="running" radius={1} />,
      );

      // With radius=1, 6 > 5, so sliding window should activate
      const ellipsis = screen.queryAllByLabelText(/hidden steps/);
      expect(ellipsis.length).toBeGreaterThan(0);
    });

    it('handles 50+ steps without error', () => {
      const fiftySteps: FlowProgressStep[] = Array.from({ length: 50 }, (_, i) => ({
        id: `s${i + 1}`,
        label: `Step ${i + 1}`,
        status: i < 20 ? 'complete' as const : i === 20 ? 'active' as const : 'pending' as const,
      }));

      const { container } = render(
        <FlowProgress mode="full" steps={fiftySteps} status="running" />,
      );

      expect(container.firstChild).toBeInTheDocument();
      expect(screen.getByLabelText(/Step 1: Step 1/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Step 50: Step 50/)).toBeInTheDocument();
    });

    it('handles 200 steps without error', () => {
      const twoHundredSteps: FlowProgressStep[] = Array.from({ length: 200 }, (_, i) => ({
        id: `s${i + 1}`,
        label: `Step ${i + 1}`,
        status: i < 100 ? 'complete' as const : i === 100 ? 'active' as const : 'pending' as const,
      }));

      const { container } = render(
        <FlowProgress mode="compact" steps={twoHundredSteps} status="running" />,
      );

      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('theme support', () => {
    it('applies default theme when no theme prop', () => {
      const { container } = render(
        <FlowProgress mode="full" steps={mockSteps} status="running" />,
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('accepts partial theme override', () => {
      const customTheme: Partial<FlowProgressTheme> = {
        activeColor: 'bg-indigo-500',
      };

      const { container } = render(
        <FlowProgress mode="full" steps={mockSteps} status="running" theme={customTheme} />,
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('applies step type colors from theme', () => {
      const customTheme: Partial<FlowProgressTheme> = {
        stepColors: { 'ai.summarize': 'bg-indigo-500' },
      };

      const { container } = render(
        <FlowProgress mode="full" steps={typedSteps} status="running" theme={customTheme} />,
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders type-aware step circles in full mode', () => {
      render(
        <FlowProgress mode="full" steps={typedSteps} status="running" />,
      );

      // All steps should render
      expect(screen.getByText('Search')).toBeInTheDocument();
      expect(screen.getByText('Summarize')).toBeInTheDocument();
      expect(screen.getByText('Transform')).toBeInTheDocument();
    });

    it('renders type-aware icons in compact mode', () => {
      render(
        <FlowProgress mode="compact" steps={typedSteps} status="running" />,
      );

      expect(screen.getByText('Search')).toBeInTheDocument();
      expect(screen.getByText('Summarize')).toBeInTheDocument();
      expect(screen.getByText('Transform')).toBeInTheDocument();
    });

    it('uses theme error color for error steps', () => {
      const errorSteps: FlowProgressStep[] = [
        { id: '1', label: 'Failed', status: 'error', type: 'ai.summarize' },
      ];

      const { container } = render(
        <FlowProgress mode="full" steps={errorSteps} status="error" />,
      );

      expect(container.firstChild).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('renders segmented progress bar with type colors', () => {
      const { container } = render(
        <FlowProgress mode="full" steps={typedSteps} status="running" />,
      );

      const progressBar = container.querySelector('[data-testid="progress-bar"]');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar!.children.length).toBe(3);
    });
  });

  describe('context adapter pattern', () => {
    it('adaptSteps converts external data to FlowProgressStep array', () => {
      interface ExternalStep {
        uid: string;
        title: string;
        done: boolean;
        category: string;
      }

      const externalData: ExternalStep[] = [
        { uid: 'a', title: 'Search', done: true, category: 'http.search' },
        { uid: 'b', title: 'Process', done: false, category: 'transform' },
      ];

      const adapted = adaptSteps(externalData, (ext, i) => ({
        id: ext.uid,
        label: ext.title,
        status: ext.done ? 'complete' : 'pending',
        type: ext.category,
      }));

      expect(adapted).toHaveLength(2);
      expect(adapted[0]).toEqual({
        id: 'a',
        label: 'Search',
        status: 'complete',
        type: 'http.search',
      });
      expect(adapted[1]).toEqual({
        id: 'b',
        label: 'Process',
        status: 'pending',
        type: 'transform',
      });
    });

    it('adapted steps render correctly in FlowProgress', () => {
      const adapted = adaptSteps(
        [{ key: '1', name: 'Step A' }, { key: '2', name: 'Step B' }],
        (item, i) => ({
          id: item.key,
          label: item.name,
          status: i === 0 ? 'complete' as const : 'pending' as const,
        }),
      );

      render(
        <FlowProgress mode="compact" steps={adapted} status="running" />,
      );

      expect(screen.getByText('Step A')).toBeInTheDocument();
      expect(screen.getByText('Step B')).toBeInTheDocument();
    });

    it('adaptSteps handles empty array', () => {
      const result = adaptSteps([], (item: any) => ({
        id: '',
        label: '',
        status: 'pending' as const,
      }));

      expect(result).toEqual([]);
    });
  });

  describe('external integration pattern (stepRenderer)', () => {
    it('calls stepRenderer for each visible step in full mode', () => {
      const stepRenderer = jest.fn((step, props) => (
        <div key={step.id} data-testid={`custom-${step.id}`}>
          Custom: {step.label}
        </div>
      ));

      render(
        <FlowProgress
          mode="full"
          steps={mockSteps}
          status="running"
          stepRenderer={stepRenderer}
        />,
      );

      expect(stepRenderer).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId('custom-1')).toBeInTheDocument();
      expect(screen.getByTestId('custom-2')).toBeInTheDocument();
      expect(screen.getByTestId('custom-3')).toBeInTheDocument();
    });

    it('calls stepRenderer for each visible step in compact mode', () => {
      const stepRenderer = jest.fn((step, props) => (
        <div key={step.id} data-testid={`compact-${step.id}`}>
          {step.label}
        </div>
      ));

      render(
        <FlowProgress
          mode="compact"
          steps={mockSteps}
          status="running"
          stepRenderer={stepRenderer}
        />,
      );

      expect(stepRenderer).toHaveBeenCalledTimes(3);
    });

    it('passes correct props to stepRenderer', () => {
      const stepRenderer = jest.fn((step, props) => (
        <div key={step.id}>{step.label}</div>
      ));

      render(
        <FlowProgress
          mode="full"
          steps={typedSteps}
          status="running"
          stepRenderer={stepRenderer}
        />,
      );

      // Check the second call (active step)
      const [step, props] = stepRenderer.mock.calls[1];
      expect(step.id).toBe('2');
      expect(step.status).toBe('active');
      expect(props.isActive).toBe(true);
      expect(props.mode).toBe('full');
      expect(props.bgColor).toBeTruthy();
      expect(props.textColor).toBeTruthy();
    });

    it('falls back to default rendering when stepRenderer returns null', () => {
      const stepRenderer = jest.fn(() => null);

      render(
        <FlowProgress
          mode="full"
          steps={mockSteps}
          status="running"
          stepRenderer={stepRenderer}
        />,
      );

      // Default rendering should show step labels
      expect(screen.getByText('Discover')).toBeInTheDocument();
      expect(screen.getByText('Write')).toBeInTheDocument();
    });
  });

  describe('common', () => {
    it('applies custom className', () => {
      const { container } = render(
        <FlowProgress
          mode="full"
          steps={mockSteps}
          status="running"
          className="my-custom-class"
        />,
      );

      expect(container.firstChild).toHaveClass('my-custom-class');
    });

    it('renders with empty steps', () => {
      const { container } = render(
        <FlowProgress mode="full" steps={[]} status="idle" />,
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('handles error status steps', () => {
      render(
        <FlowProgress
          mode="full"
          steps={[{ id: '1', label: 'Failed Step', status: 'error' }]}
          status="error"
        />,
      );

      expect(screen.getByText('Failed Step')).toBeInTheDocument();
    });

    it('handles single step workflow', () => {
      render(
        <FlowProgress
          mode="full"
          steps={[{ id: '1', label: 'Only Step', status: 'active' }]}
          status="running"
        />,
      );

      expect(screen.getByText('Only Step')).toBeInTheDocument();
    });

    it('renders correctly in compact mode with types', () => {
      const { container } = render(
        <FlowProgress
          mode="compact"
          steps={typedSteps}
          status="running"
          activity="Processing step 2..."
          lastResult="Step 1 found 10 results"
        />,
      );

      expect(container.firstChild).toBeInTheDocument();
      expect(screen.getByText('Processing step 2...')).toBeInTheDocument();
      expect(screen.getByText('Step 1 found 10 results')).toBeInTheDocument();
    });
  });
});
