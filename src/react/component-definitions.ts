/**
 * Component Definitions — Type-safe catalog of flow step type components.
 *
 * Defines the shape of component metadata used by ComponentCatalog
 * and any programmatic tooling that needs to describe step types.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOTE TO AGENTS: REASON ABOUT LAYOUT BEFORE SELECTING COMPONENTS
 * ─────────────────────────────────────────────────────────────────────
 *
 * Each component definition below has multiple configurable fields
 * (inputs, outputs, contract rules, use cases). When you compose a
 * flow that includes these step types, the visual weight of each step
 * node depends on which component you choose AND the rendering area
 * available in the host UI.
 *
 * Before wiring up steps:
 *  1. Determine the rendering context — Will these steps appear in a
 *     FlowCanvas (large 2D area), FlowProgress (horizontal stepper),
 *     ComponentCatalog (browsable list), or StepDetail (inspection pane)?
 *  2. Match step density to area — A 5-step flow in a wide panel can
 *     show full labels and icons; the same flow in a 280px sidebar
 *     should use compact mode with truncated labels and radius=1.
 *  3. Use `contractRules` as constraints, not suggestions — If a
 *     component definition lists contract rules, enforce them in the
 *     flow definition. Violating them causes runtime errors or
 *     degraded UX (e.g., an empty prompt on an LLM step shows a
 *     blank card to the user).
 *  4. Prefer fewer, well-configured steps over many under-configured
 *     ones — Each additional step adds visual and cognitive load.
 *     Consolidate where the domain allows it.
 * ─────────────────────────────────────────────────────────────────────
 */

import type { UIStepType } from './types';

/** A single input/output field specification */
export interface ComponentFieldSpec {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

/** A use case example for a component */
export interface ComponentUseCase {
  title: string;
  description: string;
}

/** A code reference within the codebase */
export interface ComponentReference {
  label: string;
  path: string;
  description: string;
}

/** Complete definition of a flow component/step type */
export interface ComponentDefinition {
  type: UIStepType;
  name: string;
  description: string;
  category: string;
  inputs: ComponentFieldSpec[];
  outputs: ComponentFieldSpec[];
  useCases: ComponentUseCase[];
  references: ComponentReference[];
  contractRules?: string[];
}

/** Default component definitions for the 7 UI step types */
export const DEFAULT_COMPONENT_DEFINITIONS: ComponentDefinition[] = [
  {
    type: 'llm',
    name: 'AI Processing',
    description: 'Sends a prompt to a language model and returns structured output. Supports text generation, summarization, and extraction.',
    category: 'AI',
    inputs: [
      { name: 'prompt', type: 'string', required: true, description: 'System prompt for the LLM' },
      { name: 'userMessage', type: 'string', required: false, description: 'User message / input text' },
      { name: 'model', type: 'string', required: false, description: 'Model identifier (e.g., "gpt-4o")' },
    ],
    outputs: [
      { name: 'text', type: 'string', required: true, description: 'Generated text response' },
      { name: 'usage', type: 'object', required: false, description: 'Token usage statistics' },
    ],
    useCases: [
      { title: 'Content Generation', description: 'Generate articles, summaries, or creative text from a prompt' },
      { title: 'Data Extraction', description: 'Extract structured data from unstructured text' },
      { title: 'Classification', description: 'Classify text into categories using LLM reasoning' },
    ],
    references: [],
    contractRules: [
      'Must have a non-empty prompt',
      'Output schema must define at least one field',
      'Model identifier should match a registered provider',
    ],
  },
  {
    type: 'user-input',
    name: 'User Input',
    description: 'Collects data from the user via form fields. Pauses execution until input is provided.',
    category: 'Input',
    inputs: [
      { name: 'fields', type: 'SchemaField[]', required: true, description: 'Fields to present to the user' },
    ],
    outputs: [
      { name: 'data', type: 'object', required: true, description: 'User-provided values keyed by field name' },
    ],
    useCases: [
      { title: 'Form Collection', description: 'Gather user preferences, settings, or content inputs' },
      { title: 'Approval Gate', description: 'Pause flow for manual review or approval' },
    ],
    references: [],
    contractRules: ['Must define at least one input field'],
  },
  {
    type: 'transform',
    name: 'Transform',
    description: 'Applies a pure transformation to data — filter, map, reduce, reshape, or format conversion.',
    category: 'Transform',
    inputs: [
      { name: 'data', type: 'unknown', required: true, description: 'Input data to transform' },
    ],
    outputs: [
      { name: 'result', type: 'unknown', required: true, description: 'Transformed output data' },
    ],
    useCases: [
      { title: 'Data Filtering', description: 'Filter arrays or objects by criteria' },
      { title: 'Format Conversion', description: 'Convert between JSON, CSV, markdown, etc.' },
      { title: 'Aggregation', description: 'Reduce collections to summary statistics' },
    ],
    references: [],
    contractRules: ['Transform must be a pure function (no side effects)'],
  },
  {
    type: 'validate',
    name: 'Validation',
    description: 'Checks data against constraints and returns pass/fail with detailed error messages.',
    category: 'Validation',
    inputs: [
      { name: 'data', type: 'unknown', required: true, description: 'Data to validate' },
      { name: 'rules', type: 'object', required: false, description: 'Validation rules or schema' },
    ],
    outputs: [
      { name: 'valid', type: 'boolean', required: true, description: 'Whether validation passed' },
      { name: 'errors', type: 'string[]', required: false, description: 'List of validation error messages' },
    ],
    useCases: [
      { title: 'Schema Validation', description: 'Validate data against a JSON schema' },
      { title: 'Business Rules', description: 'Enforce domain-specific constraints' },
    ],
    references: [],
    contractRules: ['Must produce a boolean valid field', 'Errors array must be present when valid=false'],
  },
  {
    type: 'display',
    name: 'Display',
    description: 'Renders data as a visual output — text, chart, table, or formatted document.',
    category: 'Output',
    inputs: [
      { name: 'data', type: 'unknown', required: true, description: 'Data to display' },
      { name: 'format', type: 'string', required: false, description: 'Display format (text, table, chart, etc.)' },
    ],
    outputs: [
      { name: 'rendered', type: 'string', required: true, description: 'Rendered output content' },
    ],
    useCases: [
      { title: 'Report Generation', description: 'Format data into a readable report' },
      { title: 'Dashboard Widget', description: 'Render a chart or KPI card' },
    ],
    references: [],
  },
  {
    type: 'chat',
    name: 'Chat',
    description: 'Multi-turn conversational interaction with a user or AI agent.',
    category: 'Communication',
    inputs: [
      { name: 'messages', type: 'Message[]', required: true, description: 'Conversation history' },
    ],
    outputs: [
      { name: 'response', type: 'string', required: true, description: 'Latest response message' },
    ],
    useCases: [
      { title: 'Interactive Q&A', description: 'Multi-turn question and answer sessions' },
      { title: 'Guided Workflow', description: 'Walk users through a process conversationally' },
    ],
    references: [],
  },
  {
    type: 'external-input',
    name: 'External Input',
    description: 'Fetches data from an external source — API, database, or file system.',
    category: 'External',
    inputs: [
      { name: 'source', type: 'string', required: true, description: 'Source URL or identifier' },
    ],
    outputs: [
      { name: 'data', type: 'unknown', required: true, description: 'Retrieved external data' },
    ],
    useCases: [
      { title: 'API Integration', description: 'Fetch data from a REST or GraphQL API' },
      { title: 'Data Import', description: 'Load data from files, databases, or cloud storage' },
    ],
    references: [],
  },
];

/** Look up a component definition by step type */
export function getComponentByType(
  type: UIStepType,
  definitions: ComponentDefinition[] = DEFAULT_COMPONENT_DEFINITIONS,
): ComponentDefinition | undefined {
  return definitions.find(d => d.type === type);
}
