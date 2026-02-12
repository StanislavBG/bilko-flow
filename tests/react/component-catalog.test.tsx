import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ComponentCatalog } from '../../src/react/component-catalog';
import type { ComponentCatalogProps } from '../../src/react/component-catalog';
import { DEFAULT_COMPONENT_DEFINITIONS } from '../../src/react/component-definitions';

function renderCatalog(props: Partial<ComponentCatalogProps> = {}) {
  const defaults: ComponentCatalogProps = {
    definitions: DEFAULT_COMPONENT_DEFINITIONS,
    ...props,
  };
  return { ...render(<ComponentCatalog {...defaults} />), props: defaults };
}

describe('ComponentCatalog', () => {
  it('renders the catalog header with correct count', () => {
    renderCatalog();
    expect(screen.getByText('Component Catalog')).toBeInTheDocument();
    expect(screen.getByText('7 step types available')).toBeInTheDocument();
  });

  it('renders all step type names', () => {
    renderCatalog();
    expect(screen.getByText('AI Processing')).toBeInTheDocument();
    expect(screen.getByText('User Input')).toBeInTheDocument();
    expect(screen.getByText('External Input')).toBeInTheDocument();
    // Some names match their category headers so they appear twice
    for (const name of ['Transform', 'Validation', 'Display', 'Chat']) {
      expect(screen.getAllByText(name).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('groups definitions by category', () => {
    renderCatalog();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
  });

  it('filters by search query', () => {
    renderCatalog();
    const searchInput = screen.getByPlaceholderText('Search components...');

    fireEvent.change(searchInput, { target: { value: 'transform' } });

    // "Transform" appears as both a category header and component name
    expect(screen.getAllByText('Transform').length).toBeGreaterThan(0);
    expect(screen.queryByText('AI Processing')).not.toBeInTheDocument();
    expect(screen.queryByText('Chat')).not.toBeInTheDocument();
  });

  it('shows empty state for no matches', () => {
    renderCatalog();
    const searchInput = screen.getByPlaceholderText('Search components...');

    fireEvent.change(searchInput, { target: { value: 'zzzznotfound' } });

    expect(screen.getByText(/No components match/)).toBeInTheDocument();
  });

  it('clears search when X button clicked', () => {
    renderCatalog();
    const searchInput = screen.getByPlaceholderText('Search components...');

    fireEvent.change(searchInput, { target: { value: 'transform' } });
    expect(screen.queryByText('AI Processing')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(screen.getByText('AI Processing')).toBeInTheDocument();
  });

  it('navigates to detail view when a component is clicked', () => {
    renderCatalog();
    fireEvent.click(screen.getByLabelText('View AI Processing'));

    // Detail view header
    expect(screen.getByText('AI Processing')).toBeInTheDocument();
    expect(screen.getByText('Inputs')).toBeInTheDocument();
    expect(screen.getByText('Outputs')).toBeInTheDocument();
    expect(screen.getByLabelText('Back to catalog')).toBeInTheDocument();
  });

  it('shows input/output fields in detail view', () => {
    renderCatalog();
    fireEvent.click(screen.getByLabelText('View AI Processing'));

    expect(screen.getByText('prompt')).toBeInTheDocument();
    expect(screen.getByText('text')).toBeInTheDocument();
  });

  it('shows use cases in detail view', () => {
    renderCatalog();
    fireEvent.click(screen.getByLabelText('View AI Processing'));

    expect(screen.getByText('Use Cases')).toBeInTheDocument();
    expect(screen.getByText('Content Generation')).toBeInTheDocument();
    expect(screen.getByText('Data Extraction')).toBeInTheDocument();
  });

  it('shows contract rules in detail view', () => {
    renderCatalog();
    fireEvent.click(screen.getByLabelText('View AI Processing'));

    expect(screen.getByText('Contract Rules')).toBeInTheDocument();
    expect(screen.getByText('Must have a non-empty prompt')).toBeInTheDocument();
  });

  it('navigates back to list view from detail', () => {
    renderCatalog();
    fireEvent.click(screen.getByLabelText('View AI Processing'));
    expect(screen.getByText('Inputs')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Back to catalog'));
    expect(screen.getByText('Component Catalog')).toBeInTheDocument();
    expect(screen.getByText('7 step types available')).toBeInTheDocument();
  });

  it('calls onSelect when Use button is clicked', () => {
    const onSelect = jest.fn();
    renderCatalog({ onSelect });

    fireEvent.click(screen.getByLabelText('View AI Processing'));
    fireEvent.click(screen.getByText('Use AI Processing'));

    expect(onSelect).toHaveBeenCalledWith('llm');
  });

  it('hides Use button when onSelect is not provided', () => {
    renderCatalog({ onSelect: undefined });
    fireEvent.click(screen.getByLabelText('View AI Processing'));

    expect(screen.queryByText(/Use AI Processing/)).not.toBeInTheDocument();
  });

  it('shows descriptions in list view', () => {
    renderCatalog();
    expect(screen.getByText(/Sends a prompt to a language model/)).toBeInTheDocument();
  });

  it('works with empty definitions array', () => {
    renderCatalog({ definitions: [] });
    expect(screen.getByText('0 step types available')).toBeInTheDocument();
  });
});
