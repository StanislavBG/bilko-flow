import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CanvasBuilder } from '../../src/react/canvas-builder';
import type { ParsedIntent, CanvasBuilderProps } from '../../src/react/canvas-builder';
import type { FlowDefinition } from '../../src/react/types';

const testFlow: FlowDefinition = {
  id: 'test',
  name: 'Test Flow',
  description: 'A test flow',
  version: '1.0.0',
  steps: [
    { id: 'step-1', name: 'Input', type: 'user-input', description: 'Get input', dependsOn: [] },
    { id: 'step-2', name: 'Process', type: 'llm', description: 'Process data', dependsOn: ['step-1'] },
  ],
  tags: ['test'],
};

function mockParseIntent(intent: Partial<ParsedIntent> = {}): CanvasBuilderProps['onParseIntent'] {
  return jest.fn().mockResolvedValue({
    action: 'add',
    stepType: 'transform',
    stepName: 'New Transform',
    targetStepIds: ['step-1'],
    description: 'Add a transform step',
    ...intent,
  });
}

function renderBuilder(props: Partial<CanvasBuilderProps> = {}) {
  const defaults: CanvasBuilderProps = {
    flow: testFlow,
    selectedStepIds: new Set(['step-1']),
    onApplyMutation: jest.fn(),
    onClose: jest.fn(),
    onParseIntent: mockParseIntent(),
    ...props,
  };
  return { ...render(<CanvasBuilder {...defaults} />), props: defaults };
}

describe('CanvasBuilder', () => {
  it('renders the builder panel with header', () => {
    renderBuilder();
    expect(screen.getByText('Voice Builder')).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('shows greeting for zero selection', () => {
    renderBuilder({ selectedStepIds: new Set() });
    expect(screen.getByText(/Select a node/)).toBeInTheDocument();
  });

  it('shows greeting for single selection', () => {
    renderBuilder({ selectedStepIds: new Set(['step-1']) });
    expect(screen.getByText(/one node selected/)).toBeInTheDocument();
  });

  it('shows greeting for multiple selection', () => {
    renderBuilder({ selectedStepIds: new Set(['step-1', 'step-2']) });
    expect(screen.getByText(/2 nodes selected/)).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = jest.fn();
    renderBuilder({ onClose });
    fireEvent.click(screen.getByLabelText('Close builder'));
    expect(onClose).toHaveBeenCalled();
  });

  it('sends user text and calls onParseIntent', async () => {
    const onParseIntent = mockParseIntent();
    renderBuilder({ onParseIntent });

    const input = screen.getByPlaceholderText(/Tell me what to change/);
    fireEvent.change(input, { target: { value: 'add a transform step' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onParseIntent).toHaveBeenCalledWith(
        'add a transform step',
        ['step-1'],
        testFlow.steps,
      );
    });
  });

  it('shows mutation preview after intent is parsed', async () => {
    renderBuilder();

    const input = screen.getByPlaceholderText(/Tell me what to change/);
    fireEvent.change(input, { target: { value: 'add a step' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByText(/Valid change/)).toBeInTheDocument();
      expect(screen.getByText('Apply')).toBeInTheDocument();
    });
  });

  it('applies mutation when Apply button is clicked', async () => {
    const onApplyMutation = jest.fn();
    renderBuilder({ onApplyMutation });

    const input = screen.getByPlaceholderText(/Tell me what to change/);
    fireEvent.change(input, { target: { value: 'add a step' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByText('Apply')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Apply'));
    expect(onApplyMutation).toHaveBeenCalled();
  });

  it('cancels pending mutation when Cancel clicked', async () => {
    renderBuilder();

    const input = screen.getByPlaceholderText(/Tell me what to change/);
    fireEvent.change(input, { target: { value: 'add a step' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText(/Cancelled/)).toBeInTheDocument();
  });

  it('handles unknown intent gracefully', async () => {
    const onParseIntent = mockParseIntent({ action: 'unknown' });
    renderBuilder({ onParseIntent });

    const input = screen.getByPlaceholderText(/Tell me what to change/);
    fireEvent.change(input, { target: { value: 'do something weird' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByText(/not sure what you mean/)).toBeInTheDocument();
    });
  });

  it('confirms pending mutation via text confirmation', async () => {
    const onApplyMutation = jest.fn();
    renderBuilder({ onApplyMutation });

    const input = screen.getByPlaceholderText(/Tell me what to change/);

    // First: create a pending mutation
    fireEvent.change(input, { target: { value: 'add a step' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByText('Apply')).toBeInTheDocument();
    });

    // Then: confirm via text
    fireEvent.change(input, { target: { value: 'yes' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(onApplyMutation).toHaveBeenCalled();
    });
  });

  it('rejects pending mutation via text rejection', async () => {
    renderBuilder();

    const input = screen.getByPlaceholderText(/Tell me what to change/);

    fireEvent.change(input, { target: { value: 'add a step' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByText('Apply')).toBeInTheDocument();
    });

    fireEvent.change(input, { target: { value: 'no' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByText(/No problem/)).toBeInTheDocument();
    });
  });

  it('does not submit empty input', () => {
    const onParseIntent = mockParseIntent();
    renderBuilder({ onParseIntent });

    const input = screen.getByPlaceholderText(/Tell me what to change/);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    expect(onParseIntent).not.toHaveBeenCalled();
  });

  it('disables send button when input is empty', () => {
    renderBuilder();
    const sendBtn = screen.getByLabelText('Send message');
    expect(sendBtn).toBeDisabled();
  });
});
