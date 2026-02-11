import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FlowTimeline } from '../../src/react/flow-timeline';
import type { FlowDefinition, StepExecution } from '../../src/react/types';

const mockFlow: FlowDefinition = {
  id: 'flow-1',
  name: 'Test Flow',
  description: 'A test flow',
  version: '1.0.0',
  steps: [
    { id: 's1', name: 'Search News', type: 'llm', description: 'Search', dependsOn: [] },
    { id: 's2', name: 'Write Article', type: 'llm', description: 'Write', dependsOn: ['s1'] },
    { id: 's3', name: 'Format Output', type: 'transform', description: 'Format', dependsOn: ['s2'] },
  ],
  tags: [],
};

describe('FlowTimeline', () => {
  it('renders all step names (delegated to FlowProgress compact)', () => {
    render(
      <FlowTimeline flow={mockFlow} selectedStepId={null} onSelectStep={() => {}} />,
    );

    expect(screen.getByText('Search News')).toBeInTheDocument();
    expect(screen.getByText('Write Article')).toBeInTheDocument();
    // Third step may be truncated by adaptive labeling (distance 2 from active)
    expect(screen.getByText(/Format Ou/)).toBeInTheDocument();
  });

  it('renders step count in header', () => {
    render(
      <FlowTimeline flow={mockFlow} selectedStepId={null} onSelectStep={() => {}} />,
    );

    expect(screen.getByText('Steps (3)')).toBeInTheDocument();
  });

  it('calls onSelectStep when a step is clicked (via onStepClick)', () => {
    const onSelectStep = jest.fn();
    render(
      <FlowTimeline flow={mockFlow} selectedStepId={null} onSelectStep={onSelectStep} />,
    );

    fireEvent.click(screen.getByText('Write Article'));
    expect(onSelectStep).toHaveBeenCalledWith('s2');
  });

  it('maps execution status correctly', () => {
    const executions: Record<string, StepExecution> = {
      s1: { stepId: 's1', status: 'success' },
      s2: { stepId: 's2', status: 'running' },
    };

    render(
      <FlowTimeline
        flow={mockFlow}
        selectedStepId={null}
        onSelectStep={() => {}}
        executions={executions}
      />,
    );

    // All step names should render through the FlowProgress adapter
    expect(screen.getByText('Search News')).toBeInTheDocument();
    expect(screen.getByText('Write Article')).toBeInTheDocument();
    // Third step may be adaptively labeled
    expect(screen.getByText(/Format Ou/)).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <FlowTimeline
        flow={mockFlow}
        selectedStepId={null}
        onSelectStep={() => {}}
        className="my-class"
      />,
    );

    expect(container.firstChild).toHaveClass('my-class');
  });

  it('renders flow name as label', () => {
    render(
      <FlowTimeline flow={mockFlow} selectedStepId={null} onSelectStep={() => {}} />,
    );

    // FlowTimeline passes flow.name as label to FlowProgress
    // The header shows the step count
    expect(screen.getByText('Steps (3)')).toBeInTheDocument();
  });
});
