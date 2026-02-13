import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FlowProgressVertical } from '../../src/react/flow-progress-vertical';
import { FlowProgress } from '../../src/react/flow-progress';
import type { FlowProgressStep } from '../../src/react/types';
import { DEFAULT_FLOW_PROGRESS_THEME } from '../../src/react/step-type-config';

const theme = DEFAULT_FLOW_PROGRESS_THEME;

const mockSteps: FlowProgressStep[] = [
  { id: '1', label: 'Fetch RSS Feed', status: 'complete', type: 'http.search' },
  { id: '2', label: 'Parse Episodes', status: 'complete', type: 'transform.map' },
  { id: '3', label: 'Fetch Transcripts', status: 'active', type: 'http.request' },
  { id: '4', label: 'Generate Summary', status: 'pending', type: 'ai.summarize' },
  { id: '5', label: 'Publish', status: 'pending', type: 'social.post' },
];

describe('FlowProgressVertical', () => {
  it('renders all steps vertically when count <= 2*radius+3', () => {
    const { container } = render(
      <FlowProgressVertical steps={mockSteps} status="running" theme={theme} />,
    );

    expect(container.querySelector('[data-testid="vertical-mode"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="vertical-timeline"]')).toBeInTheDocument();

    // All 5 steps should be visible (5 <= 2*2+3=7)
    for (const step of mockSteps) {
      expect(screen.getByLabelText(new RegExp(step.label))).toBeInTheDocument();
    }
  });

  it('renders label and status in header', () => {
    render(
      <FlowProgressVertical
        steps={mockSteps}
        label="Podcast Pipeline"
        status="running"
        theme={theme}
      />,
    );

    expect(screen.getByText('Podcast Pipeline')).toBeInTheDocument();
    expect(screen.getByText('2/5')).toBeInTheDocument();
  });

  it('shows activity text only on the active step', () => {
    render(
      <FlowProgressVertical
        steps={mockSteps}
        status="running"
        activity="Fetching episode data..."
        theme={theme}
      />,
    );

    expect(screen.getByText('Fetching episode data...')).toBeInTheDocument();

    // Activity text should appear within the active step's container
    const activeStep = screen.getByTestId('vertical-step-3');
    expect(activeStep).toHaveTextContent('Fetching episode data...');
  });

  it('renders type-colored dots for steps with types', () => {
    const { container } = render(
      <FlowProgressVertical steps={mockSteps} status="running" theme={theme} />,
    );

    // Steps with types should have colored dot indicators
    const typeDots = container.querySelectorAll('.rounded-full.w-2.h-2');
    expect(typeDots.length).toBeGreaterThan(0);
  });

  it('calls onStepClick when a step is clicked', () => {
    const onStepClick = jest.fn();
    render(
      <FlowProgressVertical
        steps={mockSteps}
        status="running"
        theme={theme}
        onStepClick={onStepClick}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Fetch Transcripts/));
    expect(onStepClick).toHaveBeenCalledWith('3');
  });

  it('renders reset button when onReset provided', () => {
    const onReset = jest.fn();
    render(
      <FlowProgressVertical
        steps={mockSteps}
        status="running"
        theme={theme}
        onReset={onReset}
      />,
    );

    const resetButton = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetButton);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('renders segmented progress bar', () => {
    const { container } = render(
      <FlowProgressVertical steps={mockSteps} status="running" theme={theme} />,
    );

    const progressBar = container.querySelector('[data-testid="progress-bar"]');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar!.children.length).toBe(5);
  });

  it('shows lastResult when provided', () => {
    render(
      <FlowProgressVertical
        steps={mockSteps}
        status="running"
        theme={theme}
        lastResult="Found 12 episodes"
      />,
    );

    expect(screen.getByText('Found 12 episodes')).toBeInTheDocument();
  });

  it('renders with empty steps', () => {
    const { container } = render(
      <FlowProgressVertical steps={[]} status="idle" theme={theme} />,
    );

    expect(container.querySelector('[data-testid="vertical-mode"]')).toBeInTheDocument();
  });

  it('handles single step', () => {
    render(
      <FlowProgressVertical
        steps={[{ id: '1', label: 'Only Step', status: 'active' }]}
        status="running"
        theme={theme}
      />,
    );

    expect(screen.getByLabelText('Step 1: Only Step')).toBeInTheDocument();
  });
});

describe('FlowProgressVertical sliding window', () => {
  // 12 steps > 2*2+3=7, so sliding window activates
  const manySteps: FlowProgressStep[] = Array.from({ length: 12 }, (_, i) => ({
    id: `s${i + 1}`,
    label: `Step ${i + 1}`,
    status: i < 5 ? 'complete' as const : i === 5 ? 'active' as const : 'pending' as const,
  }));

  it('windows to First, active±radius, Last when count > threshold', () => {
    render(
      <FlowProgressVertical steps={manySteps} status="running" theme={theme} />,
    );

    // First step always shown
    expect(screen.getByLabelText(/Step 1: Step 1/)).toBeInTheDocument();
    // Last step always shown
    expect(screen.getByLabelText(/Step 12: Step 12/)).toBeInTheDocument();
    // Active step (index 5 = Step 6) always shown
    expect(screen.getByLabelText(/Step 6: Step 6/)).toBeInTheDocument();
    // Active ± radius (Steps 4, 5, 7, 8 with radius=2)
    expect(screen.getByLabelText(/Step 4: Step 4/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 5: Step 5/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 7: Step 7/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 8: Step 8/)).toBeInTheDocument();
  });

  it('shows ellipsis markers for hidden steps', () => {
    render(
      <FlowProgressVertical steps={manySteps} status="running" theme={theme} />,
    );

    const ellipsisButtons = screen.getAllByLabelText(/hidden steps/);
    expect(ellipsisButtons.length).toBeGreaterThan(0);
  });

  it('expands ellipsis on click to reveal hidden steps', () => {
    render(
      <FlowProgressVertical steps={manySteps} status="running" theme={theme} />,
    );

    // Step 2 and Step 3 should be hidden initially
    expect(screen.queryByLabelText(/Step 2: Step 2/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Step 3: Step 3/)).not.toBeInTheDocument();

    // Click the first ellipsis to expand
    const ellipsisButtons = screen.getAllByLabelText(/hidden steps/);
    fireEvent.click(ellipsisButtons[0]);

    // Hidden steps should now be visible
    expect(screen.getByLabelText(/Step 2: Step 2/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 3: Step 3/)).toBeInTheDocument();
  });

  it('collapses expanded ellipsis on click', () => {
    render(
      <FlowProgressVertical steps={manySteps} status="running" theme={theme} />,
    );

    // Expand first
    const ellipsisButtons = screen.getAllByLabelText(/hidden steps/);
    fireEvent.click(ellipsisButtons[0]);

    // Steps should be visible
    expect(screen.getByLabelText(/Step 2: Step 2/)).toBeInTheDocument();

    // Click collapse
    fireEvent.click(screen.getByText('Collapse'));

    // Steps should be hidden again
    expect(screen.queryByLabelText(/Step 2: Step 2/)).not.toBeInTheDocument();
  });

  it('shows "N more steps" text for hidden ranges', () => {
    render(
      <FlowProgressVertical steps={manySteps} status="running" theme={theme} />,
    );

    // Should show count of hidden steps (may have multiple ellipsis ranges)
    const moreButtons = screen.getAllByText(/more steps?/);
    expect(moreButtons.length).toBeGreaterThan(0);
  });

  it('respects custom radius prop', () => {
    // With radius=1, window activates at > 2*1+3 = 5 steps
    const sixSteps: FlowProgressStep[] = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i + 1}`,
      label: `Step ${i + 1}`,
      status: i === 2 ? 'active' as const : 'pending' as const,
    }));

    render(
      <FlowProgressVertical steps={sixSteps} status="running" theme={theme} radius={1} />,
    );

    // 6 > 5, so window should activate
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
      <FlowProgressVertical steps={fiftySteps} status="running" theme={theme} />,
    );

    expect(container.querySelector('[data-testid="vertical-mode"]')).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 1: Step 1/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Step 50: Step 50/)).toBeInTheDocument();
  });
});

describe('FlowProgressVertical connector coloring', () => {
  it('renders type-colored connector lines for completed steps', () => {
    const steps: FlowProgressStep[] = [
      { id: '1', label: 'Search', status: 'complete', type: 'http.search' },
      { id: '2', label: 'Transform', status: 'complete', type: 'transform.map' },
      { id: '3', label: 'Publish', status: 'pending' },
    ];

    const { container } = render(
      <FlowProgressVertical steps={steps} status="running" theme={theme} />,
    );

    // Completed steps should have connectors with type colors
    // http.search → bg-amber-500, transform.map → bg-orange-500
    const connectors = container.querySelectorAll('.w-0\\.5');
    expect(connectors.length).toBeGreaterThan(0);
  });
});

describe('FlowProgress vertical mode integration', () => {
  it('renders vertical mode when mode="vertical"', () => {
    const { container } = render(
      <FlowProgress
        mode="vertical"
        steps={mockSteps}
        status="running"
        label="Pipeline"
      />,
    );

    expect(container.querySelector('[data-testid="vertical-mode"]')).toBeInTheDocument();
    expect(screen.getByText('Pipeline')).toBeInTheDocument();
  });

  it('auto mode resolves to vertical for narrow containers', () => {
    // In JSDOM, container width is 0, which is < 480 breakpoint,
    // so auto mode should resolve to vertical
    const { container } = render(
      <FlowProgress mode="auto" steps={mockSteps} status="running" />,
    );

    // With zero-width container, auto mode should render vertical
    expect(container.querySelector('[data-testid="vertical-mode"]')).toBeInTheDocument();
  });
});
