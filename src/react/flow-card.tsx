/**
 * FlowCard — Summary card for flow registry lists/grids.
 *
 * Shows flow name, description, step count, tags, and version
 * in a compact card format for browsing flow definitions.
 */

import React from 'react';
import { Layers, Tag, GitBranch } from 'lucide-react';
import type { FlowCardProps } from './types';

/**
 * FlowCard — Summary card for a flow definition.
 *
 * @example
 * ```tsx
 * <div className="grid grid-cols-3 gap-4">
 *   {flows.map(flow => (
 *     <FlowCard
 *       key={flow.id}
 *       flow={flow}
 *       onClick={() => navigate(`/flows/${flow.id}`)}
 *     />
 *   ))}
 * </div>
 * ```
 */
export function FlowCard({ flow, onClick, className }: FlowCardProps) {
  // Count unique step types
  const stepTypes = new Set(flow.steps.map(s => s.type));

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left bg-gray-900 border border-gray-700 rounded-lg p-4
        hover:bg-gray-800 hover:border-gray-600 transition-colors
        ${className ?? ''}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm truncate">
            {flow.icon ? `${flow.icon} ` : ''}{flow.name}
          </h3>
          {flow.description && (
            <p className="text-gray-400 text-xs mt-1 line-clamp-2">
              {flow.description}
            </p>
          )}
        </div>
        <span className="text-xs text-gray-500 font-mono flex-shrink-0">
          v{flow.version}
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
        <div className="flex items-center gap-1">
          <Layers size={12} />
          <span>{flow.steps.length} step{flow.steps.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1">
          <GitBranch size={12} />
          <span>{stepTypes.size} type{stepTypes.size !== 1 ? 's' : ''}</span>
        </div>
        {flow.phases && flow.phases.length > 0 && (
          <span>{flow.phases.length} phase{flow.phases.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Tags */}
      {flow.tags.length > 0 && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          <Tag size={10} className="text-gray-500 flex-shrink-0" />
          {flow.tags.slice(0, 4).map(tag => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400"
            >
              {tag}
            </span>
          ))}
          {flow.tags.length > 4 && (
            <span className="text-[10px] text-gray-500">
              +{flow.tags.length - 4}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
