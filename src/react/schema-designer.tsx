/**
 * SchemaDesigner — Interactive schema explorer and table manager.
 *
 * Two-panel layout:
 *   Left sidebar — Schema tree navigation with tables listed under the schema.
 *                  Each table has an inline delete button. A "New Table" button
 *                  opens the SmartTableCreator widget.
 *   Right panel  — Table detail view showing column definitions in a grid.
 *                  Includes a delete button in the table header.
 *
 * The SmartTableCreator supports:
 *   - Dragging and dropping a text file onto the drop zone
 *   - Pasting text directly into a textarea
 *   - Sending the text to an LLM callback (`onParseTableFromText`) that
 *     returns a `TableDefinition`
 *   - Manual table creation with a name + empty columns as fallback
 *
 * All mutations go through `onSchemaChange` — the component is controlled.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Table2,
  Plus,
  Trash2,
  FileText,
  Upload,
  Loader2,
  ChevronRight,
  ChevronDown,
  Database,
  X,
  Sparkles,
  AlertTriangle,
  Key,
  Link2,
} from 'lucide-react';
import type {
  SchemaDesignerProps,
  SmartTableCreatorProps,
  SchemaDefinition,
  TableDefinition,
  ColumnDefinition,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateTableId(name: string, existingIds: string[]): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  let candidate = base || 'table';
  let suffix = 1;
  while (existingIds.includes(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix++;
  }
  return candidate;
}

// ─── SmartTableCreator ────────────────────────────────────────────────────────

/**
 * Smart widget for creating tables from text/file input via LLM,
 * or manually by entering a table name.
 */
function SmartTableCreator({
  existingTableIds,
  onTableCreated,
  onCancel,
  onParseTableFromText,
}: SmartTableCreatorProps) {
  const [mode, setMode] = useState<'choose' | 'smart' | 'manual'>('choose');
  const [text, setText] = useState('');
  const [tableName, setTableName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const file = files[0];
    if (!file) return;

    // Only accept text files
    if (!file.type.startsWith('text/') && !file.name.match(/\.(txt|sql|csv|tsv|json|md|ddl)$/i)) {
      setError('Please drop a text file (.txt, .sql, .csv, .json, .md, .ddl)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content === 'string') {
        setText(content);
        setError(null);
        setMode('smart');
      }
    };
    reader.onerror = () => {
      setError('Failed to read file');
    };
    reader.readAsText(file);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content === 'string') {
        setText(content);
        setError(null);
        setMode('smart');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleSmartCreate = useCallback(async () => {
    if (!text.trim()) {
      setError('Please provide some text describing the table');
      return;
    }

    if (!onParseTableFromText) {
      setError('LLM integration is not configured');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const table = await onParseTableFromText(text.trim());
      // Ensure unique ID
      if (existingTableIds.includes(table.id)) {
        table.id = generateTableId(table.name, existingTableIds);
      }
      onTableCreated(table);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse table definition');
    } finally {
      setIsProcessing(false);
    }
  }, [text, onParseTableFromText, existingTableIds, onTableCreated]);

  const handleManualCreate = useCallback(() => {
    const name = tableName.trim();
    if (!name) {
      setError('Please enter a table name');
      return;
    }

    const id = generateTableId(name, existingTableIds);
    const table: TableDefinition = {
      id,
      name,
      columns: [
        {
          name: 'id',
          type: 'serial',
          nullable: false,
          primaryKey: true,
          description: 'Primary key',
        },
      ],
    };
    onTableCreated(table);
  }, [tableName, existingTableIds, onTableCreated]);

  // ── Mode: Choose ──

  if (mode === 'choose') {
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-200">Add New Table</h4>
          <button
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        {onParseTableFromText && (
          <button
            onClick={() => setMode('smart')}
            className="w-full flex items-center gap-3 p-3 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <Sparkles size={16} className="text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200">Smart Create</div>
              <div className="text-xs text-gray-400">
                Paste text or drop a file — AI creates the table definition
              </div>
            </div>
            <ChevronRight size={16} className="text-gray-500 flex-shrink-0" />
          </button>
        )}

        <button
          onClick={() => setMode('manual')}
          className="w-full flex items-center gap-3 p-3 bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Table2 size={16} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-200">Empty Table</div>
            <div className="text-xs text-gray-400">
              Create a blank table with just a primary key
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-500 flex-shrink-0" />
        </button>
      </div>
    );
  }

  // ── Mode: Smart (LLM-powered) ──

  if (mode === 'smart') {
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-400" />
            <h4 className="text-sm font-semibold text-gray-200">Smart Table Creator</h4>
          </div>
          <button
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
            ${isDragging
              ? 'border-purple-400 bg-purple-500/10'
              : 'border-gray-600 hover:border-gray-500 bg-gray-900/50'
            }
          `}
        >
          <Upload size={24} className={`mx-auto mb-2 ${isDragging ? 'text-purple-400' : 'text-gray-500'}`} />
          <p className="text-sm text-gray-400">
            {isDragging ? 'Drop file here' : 'Drop a text file or click to browse'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            .txt, .sql, .csv, .json, .md, .ddl
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.sql,.csv,.tsv,.json,.md,.ddl"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Text area */}
        <div>
          <label className="text-xs text-gray-400 block mb-1">Or paste your text here:</label>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            placeholder={'Paste SQL DDL, CSV headers, a description of your table,\nor any text describing the data structure...'}
            rows={6}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-gray-200 font-mono placeholder-gray-600 resize-y focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg p-2">
            <AlertTriangle size={14} className="flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => { setMode('choose'); setError(null); }}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSmartCreate}
            disabled={isProcessing || !text.trim()}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${isProcessing || !text.trim()
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
              }
            `}
          >
            {isProcessing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Create Table
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Mode: Manual ──

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table2 size={16} className="text-blue-400" />
          <h4 className="text-sm font-semibold text-gray-200">New Empty Table</h4>
        </div>
        <button
          onClick={onCancel}
          className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
          aria-label="Cancel"
        >
          <X size={16} />
        </button>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Table name</label>
        <input
          type="text"
          value={tableName}
          onChange={(e) => { setTableName(e.target.value); setError(null); }}
          placeholder="e.g. users, products, orders"
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
          onKeyDown={(e) => e.key === 'Enter' && handleManualCreate()}
          autoFocus
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg p-2">
          <AlertTriangle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={() => { setMode('choose'); setError(null); }}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleManualCreate}
          disabled={!tableName.trim()}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${!tableName.trim()
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
            }
          `}
        >
          <Plus size={14} />
          Create Table
        </button>
      </div>
    </div>
  );
}

// ─── Column type badge colors ──────────────────────────────────────────────

function getColumnTypeBadge(type: string): { bg: string; text: string } {
  const t = type.toLowerCase();
  if (t.includes('serial') || t.includes('int') || t.includes('number')) {
    return { bg: 'bg-blue-500/20', text: 'text-blue-300' };
  }
  if (t.includes('text') || t.includes('varchar') || t.includes('char') || t.includes('string')) {
    return { bg: 'bg-green-500/20', text: 'text-green-300' };
  }
  if (t.includes('bool')) {
    return { bg: 'bg-yellow-500/20', text: 'text-yellow-300' };
  }
  if (t.includes('timestamp') || t.includes('date') || t.includes('time')) {
    return { bg: 'bg-orange-500/20', text: 'text-orange-300' };
  }
  if (t.includes('json')) {
    return { bg: 'bg-purple-500/20', text: 'text-purple-300' };
  }
  return { bg: 'bg-gray-500/20', text: 'text-gray-300' };
}

// ─── Table Detail Panel ───────────────────────────────────────────────────────

function TableDetailPanel({
  table,
  onDeleteTable,
}: {
  table: TableDefinition;
  onDeleteTable: (tableId: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Table header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Table2 size={20} className="text-blue-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white truncate">{table.name}</h2>
              {table.description && (
                <p className="text-sm text-gray-400 mt-0.5">{table.description}</p>
              )}
              <div className="text-xs text-gray-500 mt-1">
                {table.columns.length} column{table.columns.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Delete table button */}
          {confirmDelete ? (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-red-400">Delete table?</span>
              <button
                onClick={() => onDeleteTable(table.id)}
                className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 rounded-lg transition-colors flex-shrink-0"
              title="Delete table"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Column definitions grid */}
      <div className="p-4">
        {table.columns.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Table2 size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No columns defined</p>
          </div>
        ) : (
          <div className="border border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/50">
                  <th className="text-left px-4 py-2.5 text-gray-400 font-medium text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-2.5 text-gray-400 font-medium text-xs uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-2.5 text-gray-400 font-medium text-xs uppercase tracking-wider">Nullable</th>
                  <th className="text-left px-4 py-2.5 text-gray-400 font-medium text-xs uppercase tracking-wider">Default</th>
                  <th className="text-left px-4 py-2.5 text-gray-400 font-medium text-xs uppercase tracking-wider">Description</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((col, idx) => {
                  const badge = getColumnTypeBadge(col.type);
                  return (
                    <tr
                      key={`${col.name}-${idx}`}
                      className="border-t border-gray-700/50 hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {col.primaryKey && (
                            <Key size={12} className="text-yellow-400 flex-shrink-0" title="Primary key" />
                          )}
                          {col.references && (
                            <Link2 size={12} className="text-cyan-400 flex-shrink-0" title={`References ${col.references}`} />
                          )}
                          <span className="text-gray-200 font-mono text-xs">{col.name}</span>
                          {col.unique && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 uppercase font-medium">
                              unique
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${badge.bg} ${badge.text}`}>
                          {col.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">
                        {col.nullable ? 'Yes' : 'No'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">
                        {col.defaultValue ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[200px] truncate">
                        {col.description ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SchemaDesigner (Main Component) ──────────────────────────────────────────

/**
 * SchemaDesigner — Two-panel schema explorer with smart table creation.
 *
 * Left sidebar shows the schema tree with tables. Users can:
 *   - Select a table to view its columns in the right panel
 *   - Delete tables via inline buttons in the sidebar or the detail panel
 *   - Add new tables via the Smart Table Creator (LLM-powered or manual)
 *
 * @example
 * ```tsx
 * const [schema, setSchema] = useState<SchemaDefinition>(mySchema);
 *
 * <SchemaDesigner
 *   schema={schema}
 *   onSchemaChange={setSchema}
 *   onParseTableFromText={async (text) => {
 *     const result = await chatJSON<TableDefinition>({
 *       provider: 'claude',
 *       model: 'claude-sonnet-4-20250514',
 *       apiKey: CLAUDE_API_KEY,
 *       messages: [{ role: 'user', content: text }],
 *       systemPrompt: TABLE_PARSE_SYSTEM_PROMPT,
 *     });
 *     return result;
 *   }}
 * />
 * ```
 */
export function SchemaDesigner({
  schema,
  onSchemaChange,
  onParseTableFromText,
  className,
}: SchemaDesignerProps) {
  const [selectedTableId, setSelectedTableId] = useState<string | null>(
    schema.tables.length > 0 ? schema.tables[0].id : null,
  );
  const [isTreeExpanded, setIsTreeExpanded] = useState(true);
  const [showCreator, setShowCreator] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const selectedTable = schema.tables.find((t) => t.id === selectedTableId) ?? null;
  const existingTableIds = schema.tables.map((t) => t.id);

  // ── Handlers ──

  const handleAddTable = useCallback(
    (table: TableDefinition) => {
      const updated: SchemaDefinition = {
        ...schema,
        tables: [...schema.tables, table],
      };
      onSchemaChange(updated);
      setSelectedTableId(table.id);
      setShowCreator(false);
    },
    [schema, onSchemaChange],
  );

  const handleDeleteTable = useCallback(
    (tableId: string) => {
      const updated: SchemaDefinition = {
        ...schema,
        tables: schema.tables.filter((t) => t.id !== tableId),
      };
      onSchemaChange(updated);
      setConfirmDeleteId(null);

      // If we deleted the selected table, select the first remaining one
      if (selectedTableId === tableId) {
        setSelectedTableId(updated.tables.length > 0 ? updated.tables[0].id : null);
      }
    },
    [schema, onSchemaChange, selectedTableId],
  );

  return (
    <div
      className={`flex bg-gray-900 border border-gray-700 rounded-lg overflow-hidden ${className ?? ''}`}
      style={{ minHeight: '400px' }}
    >
      {/* ── Left Sidebar ── */}
      <div className="w-64 flex-shrink-0 border-r border-gray-700 flex flex-col bg-gray-900">
        {/* Schema header */}
        <div className="p-3 border-b border-gray-700">
          <button
            onClick={() => setIsTreeExpanded(!isTreeExpanded)}
            className="flex items-center gap-2 w-full text-left hover:bg-gray-800/50 rounded p-1 transition-colors"
          >
            {isTreeExpanded ? (
              <ChevronDown size={14} className="text-gray-400" />
            ) : (
              <ChevronRight size={14} className="text-gray-400" />
            )}
            <Database size={16} className="text-purple-400" />
            <span className="text-sm font-semibold text-gray-200 truncate flex-1">{schema.name}</span>
            <span className="text-xs text-gray-500">{schema.tables.length}</span>
          </button>
          {schema.description && (
            <p className="text-xs text-gray-500 mt-1 pl-7">{schema.description}</p>
          )}
        </div>

        {/* Table list */}
        {isTreeExpanded && (
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {schema.tables.map((table) => (
              <div
                key={table.id}
                className={`
                  group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors
                  ${selectedTableId === table.id
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'text-gray-300 hover:bg-gray-800'
                  }
                `}
                onClick={() => {
                  setSelectedTableId(table.id);
                  setConfirmDeleteId(null);
                }}
              >
                <Table2 size={14} className="flex-shrink-0 opacity-60" />
                <span className="text-sm truncate flex-1">{table.name}</span>
                <span className="text-xs text-gray-500">{table.columns.length}</span>

                {/* Delete button in sidebar */}
                {confirmDeleteId === table.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTable(table.id);
                      }}
                      className="p-0.5 text-red-400 hover:text-red-300 rounded transition-colors"
                      title="Confirm delete"
                    >
                      <Trash2 size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                      className="p-0.5 text-gray-400 hover:text-gray-200 rounded transition-colors"
                      title="Cancel"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(table.id);
                    }}
                    className="p-0.5 text-gray-500 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete table"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}

            {/* Smart Table Creator widget */}
            {showCreator ? (
              <div className="mt-2">
                <SmartTableCreator
                  existingTableIds={existingTableIds}
                  onTableCreated={handleAddTable}
                  onCancel={() => setShowCreator(false)}
                  onParseTableFromText={onParseTableFromText}
                />
              </div>
            ) : (
              <button
                onClick={() => setShowCreator(true)}
                className="w-full flex items-center gap-2 px-2 py-2 mt-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-dashed border-gray-600 hover:border-gray-500 rounded-md transition-colors"
              >
                <Plus size={14} />
                New Table
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Right Panel (Table Detail) ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-900/50">
        {selectedTable ? (
          <TableDetailPanel
            table={selectedTable}
            onDeleteTable={handleDeleteTable}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Database size={48} className="mx-auto mb-3 text-gray-700" />
              <p className="text-gray-500 text-sm">
                {schema.tables.length === 0
                  ? 'No tables yet. Click "New Table" to get started.'
                  : 'Select a table from the sidebar to view its columns.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
