/**
 * StepDetail — Rich step inspection panel.
 *
 * Shows a hero section with step info, stats, and tabbed detail views
 * for Prompt, Schema, and Execution Data.
 */

import React, { useState } from 'react';
import { Clock, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { StepDetailProps, SchemaField, StepExecution } from './types';
import { getStepVisuals } from './step-type-config';

type Tab = 'prompt' | 'schema' | 'execution';

/** Format milliseconds to human-readable duration */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/** Schema field table */
function SchemaTable({ fields, title }: { fields: SchemaField[]; title: string }) {
  if (fields.length === 0) {
    return (
      <div className="text-gray-500 text-sm">No {title.toLowerCase()} defined</div>
    );
  }

  return (
    <div>
      <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/50">
              <th className="text-left px-3 py-1.5 text-gray-400 font-medium">Name</th>
              <th className="text-left px-3 py-1.5 text-gray-400 font-medium">Type</th>
              <th className="text-left px-3 py-1.5 text-gray-400 font-medium">Required</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(field => (
              <tr key={field.name} className="border-t border-gray-700/50">
                <td className="px-3 py-1.5 text-gray-200 font-mono text-xs">{field.name}</td>
                <td className="px-3 py-1.5 text-gray-400 font-mono text-xs">{field.type}</td>
                <td className="px-3 py-1.5 text-gray-400 text-xs">
                  {field.required ? 'Yes' : 'No'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** JSON viewer for execution data */
function JsonBlock({ data, label }: { data: unknown; label: string }) {
  if (data === undefined || data === null) {
    return null;
  }

  return (
    <div>
      <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </h4>
      <pre className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto max-h-[300px] overflow-y-auto">
        {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

/** Execution stats row */
function ExecutionStats({ execution }: { execution: StepExecution }) {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {execution.durationMs !== undefined && (
        <div className="flex items-center gap-1.5 text-gray-400">
          <Clock size={14} />
          <span>{formatDuration(execution.durationMs)}</span>
        </div>
      )}
      {execution.usage && (
        <div className="flex items-center gap-1.5 text-gray-400">
          <Zap size={14} />
          <span>{execution.usage.totalTokens.toLocaleString()} tokens</span>
        </div>
      )}
      {execution.status === 'success' && (
        <div className="flex items-center gap-1.5 text-green-400">
          <CheckCircle2 size={14} />
          <span>Success</span>
        </div>
      )}
      {execution.status === 'error' && (
        <div className="flex items-center gap-1.5 text-red-400">
          <AlertTriangle size={14} />
          <span>Error</span>
        </div>
      )}
    </div>
  );
}

/**
 * StepDetail — Rich step inspection with tabbed detail views.
 *
 * @example
 * ```tsx
 * <StepDetail
 *   step={selectedStep}
 *   flow={flowDefinition}
 *   execution={executions[selectedStep.id]}
 * />
 * ```
 */
export function StepDetail({ step, flow, execution, className }: StepDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('prompt');
  const visuals = getStepVisuals(step);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'prompt', label: 'Prompt' },
    { id: 'schema', label: 'Schema' },
    { id: 'execution', label: 'Execution' },
  ];

  // Find dependencies
  const dependencies = step.dependsOn
    .map(id => flow.steps.find(s => s.id === id))
    .filter(Boolean);

  // Find dependents
  const dependents = flow.steps.filter(s => s.dependsOn.includes(step.id));

  return (
    <div className={`flex flex-col bg-gray-900 border border-gray-700 rounded-lg overflow-hidden ${className ?? ''}`}>
      {/* Hero section */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-lg ${visuals.bg} flex items-center justify-center flex-shrink-0`}>
            <span className={`text-lg ${visuals.color}`}>{visuals.shortLabel.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-base truncate">{step.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs px-2 py-0.5 rounded-full ${visuals.bg} ${visuals.color}`}>
                {visuals.label}
              </span>
              {step.subtype && (
                <span className="text-xs text-gray-500">{step.subtype}</span>
              )}
              {step.model && (
                <span className="text-xs text-gray-500 font-mono">{step.model}</span>
              )}
            </div>
            {step.description && (
              <p className="text-sm text-gray-400 mt-2">{step.description}</p>
            )}
          </div>
        </div>

        {/* Execution stats */}
        {execution && (
          <div className="mt-3">
            <ExecutionStats execution={execution} />
          </div>
        )}

        {/* Dependencies */}
        {(dependencies.length > 0 || dependents.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {dependencies.length > 0 && (
              <span className="text-gray-500">
                Depends on: {dependencies.map(d => d!.name).join(', ')}
              </span>
            )}
            {dependents.length > 0 && (
              <span className="text-gray-500">
                Required by: {dependents.map(d => d.name).join(', ')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 px-3 py-2 text-sm font-medium text-center transition-colors
              ${activeTab === tab.id
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 flex-1 overflow-y-auto">
        {activeTab === 'prompt' && (
          <div className="space-y-4">
            {step.prompt ? (
              <div>
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                  System Prompt
                </h4>
                <pre className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 whitespace-pre-wrap">
                  {step.prompt}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No prompt configured for this step.</p>
            )}
            {step.userMessage && (
              <div>
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                  User Message
                </h4>
                <pre className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 whitespace-pre-wrap">
                  {step.userMessage}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'schema' && (
          <div className="space-y-4">
            <SchemaTable fields={step.inputSchema ?? []} title="Input Schema" />
            <SchemaTable fields={step.outputSchema ?? []} title="Output Schema" />
          </div>
        )}

        {activeTab === 'execution' && (
          <div className="space-y-4">
            {execution ? (
              <>
                <JsonBlock data={execution.input} label="Input" />
                <JsonBlock data={execution.output} label="Output" />
                <JsonBlock data={execution.rawResponse} label="Raw LLM Response" />
                {execution.error && (
                  <div>
                    <h4 className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1">
                      Error
                    </h4>
                    <pre className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 text-xs text-red-300 whitespace-pre-wrap">
                      {execution.error}
                    </pre>
                  </div>
                )}
                {execution.usage && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                      Token Usage
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-xs" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))' }}>
                      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 text-center">
                        <div className="text-gray-400">Prompt</div>
                        <div className="text-white font-mono">{execution.usage.promptTokens.toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 text-center">
                        <div className="text-gray-400">Completion</div>
                        <div className="text-white font-mono">{execution.usage.completionTokens.toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 text-center">
                        <div className="text-gray-400">Total</div>
                        <div className="text-white font-mono">{execution.usage.totalTokens.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">No execution data available.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
