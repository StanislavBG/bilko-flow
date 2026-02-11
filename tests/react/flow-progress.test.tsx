import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FlowProgress } from '../../src/react/flow-progress';
import type { FlowProgressPhase } from '../../src/react/types';

const mockPhases: FlowProgressPhase[] = [
  { id: '1', label: 'Discover', status: 'complete' },
  { id: '2', label: 'Write', status: 'active' },
  { id: '3', label: 'Publish', status: 'pending' },
];

describe('FlowProgress', () => {
  describe('full mode', () => {
    it('renders all phase labels', () => {
      render(
        <FlowProgress
          mode="full"
          phases={mockPhases}
          label="Test Flow"
          status="running"
        />,
      );

      expect(screen.getByText('Discover')).toBeInTheDocument();
      expect(screen.getByText('Write')).toBeInTheDocument();
      expect(screen.getByText('Publish')).toBeInTheDocument();
    });

    it('renders flow label', () => {
      render(
        <FlowProgress mode="full" phases={mockPhases} label="My Pipeline" status="running" />,
      );

      expect(screen.getByText('My Pipeline')).toBeInTheDocument();
    });

    it('shows activity text when provided', () => {
      render(
        <FlowProgress
          mode="full"
          phases={mockPhases}
          status="running"
          activity="Writing article draft..."
        />,
      );

      expect(screen.getByText('Writing article draft...')).toBeInTheDocument();
    });

    it('renders reset button when onReset provided', () => {
      const onReset = jest.fn();
      render(
        <FlowProgress mode="full" phases={mockPhases} status="running" onReset={onReset} />,
      );

      const resetButton = screen.getByRole('button', { name: /reset/i });
      expect(resetButton).toBeInTheDocument();

      fireEvent.click(resetButton);
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('does not render reset button when onReset not provided', () => {
      render(
        <FlowProgress mode="full" phases={mockPhases} status="running" />,
      );

      expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();
    });

    it('displays pending step numbers', () => {
      render(
        <FlowProgress
          mode="full"
          phases={[
            { id: '1', label: 'Step A', status: 'pending' },
            { id: '2', label: 'Step B', status: 'pending' },
          ]}
          status="idle"
        />,
      );

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  describe('compact mode', () => {
    it('renders all phase labels', () => {
      render(
        <FlowProgress mode="compact" phases={mockPhases} status="running" />,
      );

      expect(screen.getByText('Discover')).toBeInTheDocument();
      expect(screen.getByText('Write')).toBeInTheDocument();
      expect(screen.getByText('Publish')).toBeInTheDocument();
    });

    it('shows activity text', () => {
      render(
        <FlowProgress
          mode="compact"
          phases={mockPhases}
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
          phases={mockPhases}
          status="running"
          lastResult="Generated 5 articles"
        />,
      );

      expect(screen.getByText('Generated 5 articles')).toBeInTheDocument();
    });
  });

  describe('common', () => {
    it('applies custom className', () => {
      const { container } = render(
        <FlowProgress
          mode="full"
          phases={mockPhases}
          status="running"
          className="my-custom-class"
        />,
      );

      expect(container.firstChild).toHaveClass('my-custom-class');
    });

    it('renders with empty phases', () => {
      const { container } = render(
        <FlowProgress mode="full" phases={[]} status="idle" />,
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('handles error status phases', () => {
      render(
        <FlowProgress
          mode="full"
          phases={[{ id: '1', label: 'Failed Step', status: 'error' }]}
          status="error"
        />,
      );

      expect(screen.getByText('Failed Step')).toBeInTheDocument();
    });
  });
});
