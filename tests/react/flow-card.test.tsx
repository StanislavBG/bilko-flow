import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FlowCard } from '../../src/react/flow-card';
import type { FlowDefinition } from '../../src/react/types';

const mockFlow: FlowDefinition = {
  id: 'flow-1',
  name: 'Content Pipeline',
  description: 'Generates newsletter content from news sources',
  version: '1.0.0',
  steps: [
    { id: 's1', name: 'Search', type: 'llm', description: 'Search for news', dependsOn: [] },
    { id: 's2', name: 'Write', type: 'llm', description: 'Write article', dependsOn: ['s1'] },
    { id: 's3', name: 'Format', type: 'transform', description: 'Format output', dependsOn: ['s2'] },
  ],
  tags: ['content', 'newsletter', 'automation'],
};

describe('FlowCard', () => {
  it('renders flow name', () => {
    render(<FlowCard flow={mockFlow} onClick={() => {}} />);
    expect(screen.getByText('Content Pipeline')).toBeInTheDocument();
  });

  it('renders flow description', () => {
    render(<FlowCard flow={mockFlow} onClick={() => {}} />);
    expect(screen.getByText('Generates newsletter content from news sources')).toBeInTheDocument();
  });

  it('renders version', () => {
    render(<FlowCard flow={mockFlow} onClick={() => {}} />);
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('renders step count', () => {
    render(<FlowCard flow={mockFlow} onClick={() => {}} />);
    expect(screen.getByText('3 steps')).toBeInTheDocument();
  });

  it('renders type count', () => {
    render(<FlowCard flow={mockFlow} onClick={() => {}} />);
    expect(screen.getByText('2 types')).toBeInTheDocument();
  });

  it('renders tags', () => {
    render(<FlowCard flow={mockFlow} onClick={() => {}} />);
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.getByText('newsletter')).toBeInTheDocument();
    expect(screen.getByText('automation')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = jest.fn();
    render(<FlowCard flow={mockFlow} onClick={onClick} />);

    fireEvent.click(screen.getByText('Content Pipeline'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies custom className', () => {
    const { container } = render(
      <FlowCard flow={mockFlow} onClick={() => {}} className="test-class" />,
    );

    const button = container.querySelector('button');
    expect(button).toHaveClass('test-class');
  });

  it('renders icon prefix when flow has icon', () => {
    const flowWithIcon = { ...mockFlow, icon: '📰' };
    render(<FlowCard flow={flowWithIcon} onClick={() => {}} />);
    expect(screen.getByText(/📰/)).toBeInTheDocument();
  });

  it('shows +N for excess tags', () => {
    const flowWithManyTags = {
      ...mockFlow,
      tags: ['a', 'b', 'c', 'd', 'e', 'f'],
    };
    render(<FlowCard flow={flowWithManyTags} onClick={() => {}} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('handles singular step count', () => {
    const singleStepFlow = {
      ...mockFlow,
      steps: [mockFlow.steps[0]],
    };
    render(<FlowCard flow={singleStepFlow} onClick={() => {}} />);
    expect(screen.getByText('1 step')).toBeInTheDocument();
  });
});
