/**
 * ComponentCatalog — Browsable catalog of flow step types.
 *
 * Props-driven component that renders a sidebar navigation of step types
 * with a detail panel showing description, inputs, outputs, use cases,
 * and references. Uses `getStepVisuals()` from step-type-config for
 * consistent icon/color theming.
 *
 * No API calls — the consumer passes `ComponentDefinition[]` as a prop,
 * making this fully portable across environments.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Search,
  ChevronRight,
  ArrowLeft,
  Brain,
  MousePointerClick,
  ArrowRightLeft,
  ShieldCheck,
  Monitor,
  MessageSquare,
  PlugZap,
  ImageIcon,
  Film,
  X,
} from 'lucide-react';
import type { UIStepType } from './types';
import type { ComponentDefinition } from './component-definitions';
import { STEP_TYPE_CONFIG } from './step-type-config';

// ── Icon resolver ────────────────────────────────────────

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Brain,
  MousePointerClick,
  ArrowRightLeft,
  ShieldCheck,
  Monitor,
  MessageSquare,
  PlugZap,
  ImageIcon,
  Film,
};

/** Resolve a lucide icon name to a component */
function resolveIcon(name: string): React.FC<{ className?: string }> {
  return ICON_MAP[name] ?? Brain;
}

// ── Types ────────────────────────────────────────────────

/** ComponentCatalog component props */
export interface ComponentCatalogProps {
  /** Component definitions to display */
  definitions: ComponentDefinition[];
  /** Called when user selects a component type (e.g., to insert into flow) */
  onSelect?: (type: UIStepType) => void;
  /** Additional CSS classes on root element */
  className?: string;
}

// ── Component ────────────────────────────────────────────

export function ComponentCatalog({
  definitions,
  onSelect,
  className,
}: ComponentCatalogProps) {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<UIStepType | null>(null);

  // Filter definitions by search query
  const filtered = useMemo(() => {
    if (!search.trim()) return definitions;
    const q = search.toLowerCase();
    return definitions.filter(
      d =>
        d.name.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q),
    );
  }, [definitions, search]);

  // Group by category
  const grouped = useMemo(() => {
    const groups = new Map<string, ComponentDefinition[]>();
    for (const def of filtered) {
      const existing = groups.get(def.category) ?? [];
      existing.push(def);
      groups.set(def.category, existing);
    }
    return groups;
  }, [filtered]);

  const selectedDef = useMemo(
    () => definitions.find(d => d.type === selectedType) ?? null,
    [definitions, selectedType],
  );

  const handleSelect = useCallback(
    (type: UIStepType) => {
      setSelectedType(type);
    },
    [],
  );

  const handleUse = useCallback(
    (type: UIStepType) => {
      onSelect?.(type);
    },
    [onSelect],
  );

  const handleBack = useCallback(() => {
    setSelectedType(null);
  }, []);

  // ── Detail view ──────────────────────────────────────

  if (selectedDef) {
    const visuals = STEP_TYPE_CONFIG[selectedDef.type] ?? STEP_TYPE_CONFIG.llm;
    const Icon = resolveIcon(visuals.icon);

    return (
      <div className={`flex flex-col h-full bg-gray-900 border border-gray-700 rounded-lg overflow-hidden ${className ?? ''}`}>
        {/* Detail header */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-700 bg-gray-800/50">
          <button
            onClick={handleBack}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            aria-label="Back to catalog"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className={`p-1 rounded ${visuals.bg}`}>
            <Icon className={`h-4 w-4 ${visuals.color}`} />
          </div>
          <span className="text-sm font-medium text-white">{selectedDef.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${visuals.bg} ${visuals.color}`}>
            {selectedDef.category}
          </span>
        </div>

        {/* Detail content */}
        <div className="flex-1 overflow-auto px-3 py-3 space-y-4">
          {/* Description */}
          <p className="text-sm text-gray-300">{selectedDef.description}</p>

          {/* Inputs */}
          {selectedDef.inputs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Inputs</h4>
              <div className="space-y-1.5">
                {selectedDef.inputs.map(field => (
                  <div key={field.name} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-xs">
                    <code className="px-1.5 py-0.5 rounded bg-gray-800 text-blue-400 font-mono">
                      {field.name}
                    </code>
                    <span className="text-gray-500 flex-shrink-0">{field.type}</span>
                    {field.required && (
                      <span className="text-red-400 text-[10px] flex-shrink-0">required</span>
                    )}
                    <span className="text-gray-400 flex-1 min-w-0">{field.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outputs */}
          {selectedDef.outputs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Outputs</h4>
              <div className="space-y-1.5">
                {selectedDef.outputs.map(field => (
                  <div key={field.name} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-xs">
                    <code className="px-1.5 py-0.5 rounded bg-gray-800 text-green-400 font-mono">
                      {field.name}
                    </code>
                    <span className="text-gray-500 flex-shrink-0">{field.type}</span>
                    <span className="text-gray-400 flex-1 min-w-0">{field.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Use cases */}
          {selectedDef.useCases.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Use Cases</h4>
              <div className="space-y-2">
                {selectedDef.useCases.map((uc, i) => (
                  <div key={i} className="rounded bg-gray-800/50 px-3 py-2">
                    <p className="text-xs font-medium text-white">{uc.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{uc.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contract rules */}
          {selectedDef.contractRules && selectedDef.contractRules.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contract Rules</h4>
              <ul className="space-y-1 text-xs text-gray-400">
                {selectedDef.contractRules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-yellow-500 mt-0.5">*</span>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* References */}
          {selectedDef.references.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">References</h4>
              <div className="space-y-1.5">
                {selectedDef.references.map((ref, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-blue-400">{ref.label}</span>
                    <span className="text-gray-500 ml-2">{ref.path}</span>
                    <p className="text-gray-400 mt-0.5">{ref.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Use button */}
        {onSelect && (
          <div className="shrink-0 border-t border-gray-700 p-2">
            <button
              className={`w-full py-2 rounded text-sm font-medium text-white ${visuals.accent} hover:opacity-90 transition-opacity`}
              onClick={() => handleUse(selectedDef.type)}
            >
              Use {selectedDef.name}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────

  return (
    <div className={`flex flex-col h-full bg-gray-900 border border-gray-700 rounded-lg overflow-hidden ${className ?? ''}`}>
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-gray-700 bg-gray-800/50">
        <span className="text-sm font-medium text-white">Component Catalog</span>
        <p className="text-xs text-gray-400 mt-0.5">{definitions.length} step types available</p>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-2 bg-gray-800 rounded px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-gray-500 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search components..."
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="p-0.5 rounded hover:bg-gray-700 text-gray-500 hover:text-white transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Component list */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-gray-500">
            No components match &quot;{search}&quot;
          </div>
        ) : (
          Array.from(grouped.entries()).map(([category, defs]) => (
            <div key={category}>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-800/30">
                {category}
              </div>
              {defs.map(def => {
                const visuals = STEP_TYPE_CONFIG[def.type] ?? STEP_TYPE_CONFIG.llm;
                const Icon = resolveIcon(visuals.icon);

                return (
                  <button
                    key={def.type}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800/50 transition-colors text-left group"
                    onClick={() => handleSelect(def.type)}
                    aria-label={`View ${def.name}`}
                  >
                    <div className={`p-1.5 rounded ${visuals.bg}`}>
                      <Icon className={`h-4 w-4 ${visuals.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{def.name}</p>
                      <p className="text-xs text-gray-400 truncate">{def.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" />
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
