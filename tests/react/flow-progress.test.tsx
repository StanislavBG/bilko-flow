import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FlowProgress } from '../../src/react/flow-progress';
import type { FlowProgressStep } from '../../src/react/types';

const mockSteps: FlowProgressStep[] = [
  { id: '1', label: 'Discover', status: 'complete' },
  { id: '2', label: 'Write', status: 'active' },
  { id: '3', label: 'Publish', status: 'pending' },
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

    it('renders progress track bar', () => {
      const { container } = render(
        <FlowProgress mode="full" steps={mockSteps} status="running" />,
      );

      // Progress track should exist with 33% width (1 of 3 complete)
      const progressBar = container.querySelector('[style*="width"]');
      expect(progressBar).toBeInTheDocument();
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

      // Dropdown should now show hidden step labels
      // The first gap (if active is at 5) would be steps 2-3
      // (step 0=always shown, step 1 is not in the gap because active is at 5, radius 2 means 3-7 visible)
      // Actually: visible = {0, 3,4,5,6,7, 11}, gap is 1-2 and 8-10
      // So hidden steps 2 and 3 should appear in the first dropdown
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
  });
});
