/**
 * Table Parser — LLM prompt and response handler for text-to-table conversion.
 *
 * Provides the system prompt and a factory function that wraps chatJSON() to
 * convert freeform text (SQL DDL, CSV headers, natural language descriptions,
 * etc.) into a validated TableDefinition.
 *
 * The consumer provides their LLM configuration; this module provides the
 * prompt engineering and response validation.
 *
 * @example
 * ```ts
 * import { createTableParser } from 'bilko-flow/react';
 * import { chatJSON } from 'bilko-flow';
 *
 * const parseTable = createTableParser(async (text) => {
 *   return chatJSON<TableDefinition>({
 *     provider: 'claude',
 *     model: 'claude-sonnet-4-20250514',
 *     apiKey: MY_API_KEY,
 *     messages: [{ role: 'user', content: text }],
 *     systemPrompt: TABLE_PARSE_SYSTEM_PROMPT,
 *   });
 * });
 *
 * // Use with SchemaDesigner:
 * <SchemaDesigner
 *   schema={schema}
 *   onSchemaChange={setSchema}
 *   onParseTableFromText={parseTable}
 * />
 * ```
 */

import type { TableDefinition, ColumnDefinition } from './types';

/**
 * System prompt that instructs the LLM to extract a table definition from
 * arbitrary text input. The LLM must return a JSON object conforming to
 * the TableDefinition interface.
 */
export const TABLE_PARSE_SYSTEM_PROMPT = `You are a database schema designer. Your task is to analyze the provided text and extract a table definition from it.

The text may be:
- SQL DDL (CREATE TABLE statement)
- CSV or TSV data with headers
- A natural language description of a data table
- JSON schema or sample data
- Any other text describing a data structure

You MUST respond with a single valid JSON object matching this exact structure:

{
  "id": "snake_case_table_id",
  "name": "snake_case_table_name",
  "description": "Brief description of what this table stores",
  "columns": [
    {
      "name": "column_name",
      "type": "sql_type",
      "nullable": false,
      "primaryKey": true,
      "description": "What this column stores",
      "defaultValue": "optional_default",
      "unique": false,
      "references": "other_table.column_name"
    }
  ]
}

Rules:
1. CRITICAL: Your entire response must be a single valid JSON object. No markdown, no code fences, no explanation.
2. The "id" and "name" fields should be the same snake_case value derived from the table name.
3. Use standard SQL types: serial, integer, text, boolean, timestamp, jsonb, numeric, uuid, etc.
4. Every table should have a primary key column (typically "id" with type "serial").
5. Set "nullable" to false for required columns, true for optional ones.
6. Include "references" only when the text explicitly mentions a foreign key relationship, using "table_name.column_name" format.
7. Include "defaultValue" only when the text specifies a default (e.g., "now()", "'active'", "0", "true").
8. Include "unique" only when the text specifies uniqueness constraints.
9. Infer reasonable types from context (e.g., "email" → text with unique, "created_at" → timestamp with defaultNow).
10. If the text is ambiguous, make reasonable assumptions and note them in column descriptions.`;

/**
 * Validates that a parsed LLM response conforms to the TableDefinition shape.
 * Throws with a descriptive message if validation fails.
 */
export function validateTableDefinition(raw: unknown): TableDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error('LLM response is not an object');
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    throw new Error('Table definition is missing a valid "name" field');
  }

  if (!Array.isArray(obj.columns)) {
    throw new Error('Table definition is missing a "columns" array');
  }

  const columns: ColumnDefinition[] = obj.columns.map((col: unknown, idx: number) => {
    if (!col || typeof col !== 'object') {
      throw new Error(`Column at index ${idx} is not an object`);
    }

    const c = col as Record<string, unknown>;

    if (typeof c.name !== 'string' || !c.name.trim()) {
      throw new Error(`Column at index ${idx} is missing a valid "name" field`);
    }

    if (typeof c.type !== 'string' || !c.type.trim()) {
      throw new Error(`Column "${c.name}" is missing a valid "type" field`);
    }

    return {
      name: c.name.trim(),
      type: c.type.trim(),
      nullable: typeof c.nullable === 'boolean' ? c.nullable : true,
      primaryKey: typeof c.primaryKey === 'boolean' ? c.primaryKey : false,
      description: typeof c.description === 'string' ? c.description : undefined,
      defaultValue: typeof c.defaultValue === 'string' ? c.defaultValue : undefined,
      unique: typeof c.unique === 'boolean' ? c.unique : false,
      references: typeof c.references === 'string' ? c.references : undefined,
    };
  });

  const name = obj.name.trim();
  const id = typeof obj.id === 'string' && obj.id.trim()
    ? obj.id.trim()
    : name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  return {
    id,
    name,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    columns,
  };
}

/**
 * Creates a table parser function that wraps an LLM call with validation.
 *
 * @param llmCall - A function that sends text to the LLM and returns the raw parsed JSON.
 *                  The caller is responsible for configuring the LLM provider, model, API key,
 *                  and passing TABLE_PARSE_SYSTEM_PROMPT as the system prompt.
 * @returns A function suitable for passing as `onParseTableFromText` to SchemaDesigner.
 */
export function createTableParser(
  llmCall: (text: string) => Promise<unknown>,
): (text: string) => Promise<TableDefinition> {
  return async (text: string): Promise<TableDefinition> => {
    const raw = await llmCall(text);
    return validateTableDefinition(raw);
  };
}
