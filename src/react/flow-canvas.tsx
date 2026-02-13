/**
 * FlowCanvas — 2D DAG visualization with zoom, pan, minimap,
 * search, and keyboard shortcuts.
 *
 * Renders flow steps as nodes connected by bezier curve edges,
 * color-coded by execution status.
 */

import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Search,
  X,
  Keyboard,
} from 'lucide-react';
import type { FlowCanvasProps, StepStatus } from './types';
import { computeLayout } from './layout';
import { getStepVisuals } from './step-type-config';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

/** Resolve step status from execution data */
function resolveStatus(
  stepId: string,
  executions?: Record<string, import('./types').StepExecution>,
): StepStatus {
  if (!executions) return 'idle';
  const exec = executions[stepId];
  if (!exec) return 'idle';
  return exec.status;
}

/** Status-based node border color */
function statusBorderClass(status: StepStatus): string {
  switch (status) {
    case 'success':
      return 'border-green-500';
    case 'running':
      return 'border-blue-400 animate-pulse';
    case 'error':
      return 'border-red-500';
    case 'skipped':
      return 'border-gray-600';
    default:
      return 'border-gray-600';
  }
}

/** Status-based edge stroke color */
function edgeStroke(fromStatus: StepStatus, toStatus: StepStatus): string {
  if (fromStatus === 'success' && toStatus === 'success') return '#22c55e';
  if (fromStatus === 'success' && toStatus === 'running') return '#60a5fa';
  if (fromStatus === 'error' || toStatus === 'error') return '#ef4444';
  return '#374151';
}

/** SVG bezier curve path between two points */
function bezierPath(
  x1: number, y1: number,
  x2: number, y2: number,
): string {
  const dx = Math.abs(x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/**
 * FlowCanvas — Interactive DAG visualization.
 *
 * @example
 * ```tsx
 * <FlowCanvas
 *   flow={flowDefinition}
 *   selectedStepId={selectedId}
 *   onSelectStep={setSelectedId}
 *   executions={executionData}
 * />
 * ```
 */
export function FlowCanvas({
  flow,
  selectedStepId,
  onSelectStep,
  onDeselectStep,
  executions,
  highlightStepId,
  selectedStepIds,
  onToggleSelect,
  className,
}: FlowCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Memoize layout computation
  const layout = useMemo(() => computeLayout(flow.steps), [flow.steps]);

  // Search filter
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(
      flow.steps
        .filter(s => s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q))
        .map(s => s.id),
    );
  }, [flow.steps, searchQuery]);

  // Zoom controls
  const zoomIn = useCallback(() => setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP)), []);
  const fitView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'svg') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Scroll to zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta)));
  }, []);

  // Click on canvas background to deselect
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onDeselectStep?.();
    }
  }, [onDeselectStep]);

  // Arrow key step navigation
  const navigateStep = useCallback((direction: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown') => {
    if (flow.steps.length === 0) return;

    const currentIdx = selectedStepId
      ? flow.steps.findIndex(s => s.id === selectedStepId)
      : -1;

    let nextIdx: number;
    if (currentIdx < 0) {
      nextIdx = 0;
    } else if (direction === 'ArrowRight' || direction === 'ArrowDown') {
      nextIdx = Math.min(flow.steps.length - 1, currentIdx + 1);
    } else {
      nextIdx = Math.max(0, currentIdx - 1);
    }

    onSelectStep(flow.steps[nextIdx].id);
  }, [flow.steps, selectedStepId, onSelectStep]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (searchOpen && e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
        return;
      }

      // Don't handle shortcuts when typing in search
      if (searchOpen) return;

      switch (e.key) {
        case '/':
          e.preventDefault();
          setSearchOpen(true);
          break;
        case 'f':
        case 'F':
          fitView();
          break;
        case '+':
        case '=':
          zoomIn();
          break;
        case '-':
          zoomOut();
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault();
          navigateStep(e.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown');
          break;
        case 'Escape':
          onDeselectStep?.();
          break;
        case '?':
          setShowShortcuts(s => !s);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen, fitView, zoomIn, zoomOut, onDeselectStep, navigateStep]);

  // Step map for lookups
  const stepMap = useMemo(
    () => new Map(flow.steps.map(s => [s.id, s])),
    [flow.steps],
  );

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-gray-950 border border-gray-700 rounded-lg ${className ?? ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
    >
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1">
        <button
          onClick={zoomIn}
          className="p-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="Zoom in (+)"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={zoomOut}
          className="p-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="Zoom out (-)"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={fitView}
          className="p-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="Fit view (F)"
        >
          <Maximize2 size={16} />
        </button>
        <button
          onClick={() => setSearchOpen(s => !s)}
          className="p-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="Search (/)"
        >
          <Search size={16} />
        </button>
        <button
          onClick={() => setShowShortcuts(s => !s)}
          className="p-1.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="Shortcuts (?)"
        >
          <Keyboard size={16} />
        </button>
        <span className="text-xs text-gray-500 ml-2">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5">
          <Search size={14} className="text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search steps..."
            className="bg-transparent text-sm text-white placeholder-gray-500 outline-none flex-1 min-w-[100px]"
            autoFocus
          />
          {searchQuery && (
            <span className="text-xs text-gray-400">
              {searchMatches.size} match{searchMatches.size !== 1 ? 'es' : ''}
            </span>
          )}
          <button
            onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
            className="text-gray-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Keyboard shortcuts help */}
      {showShortcuts && (
        <div className="absolute top-14 left-3 z-10 bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 space-y-1">
          <div className="font-medium text-white mb-2">Keyboard Shortcuts</div>
          <div><kbd className="text-gray-400 bg-gray-700 px-1 rounded">/</kbd> Search</div>
          <div><kbd className="text-gray-400 bg-gray-700 px-1 rounded">F</kbd> Fit view</div>
          <div><kbd className="text-gray-400 bg-gray-700 px-1 rounded">+</kbd> / <kbd className="text-gray-400 bg-gray-700 px-1 rounded">-</kbd> Zoom</div>
          <div><kbd className="text-gray-400 bg-gray-700 px-1 rounded">{'\u2190'}</kbd> <kbd className="text-gray-400 bg-gray-700 px-1 rounded">{'\u2192'}</kbd> Navigate steps</div>
          <div><kbd className="text-gray-400 bg-gray-700 px-1 rounded">Esc</kbd> Deselect</div>
          <div><kbd className="text-gray-400 bg-gray-700 px-1 rounded">?</kbd> Toggle this</div>
        </div>
      )}

      {/* Canvas content */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: layout.width,
          height: layout.height,
        }}
      >
        {/* Edges */}
        <svg
          width={layout.width}
          height={layout.height}
          className="absolute top-0 left-0 pointer-events-none"
        >
          {layout.edges.map(edge => {
            const fromStatus = resolveStatus(edge.fromId, executions);
            const toStatus = resolveStatus(edge.toId, executions);
            return (
              <path
                key={`${edge.fromId}-${edge.toId}`}
                d={bezierPath(edge.fromX, edge.fromY, edge.toX, edge.toY)}
                fill="none"
                stroke={edgeStroke(fromStatus, toStatus)}
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {flow.steps.map(step => {
          const node = layout.nodes.get(step.id);
          if (!node) return null;

          const status = resolveStatus(step.id, executions);
          const visuals = getStepVisuals(step);
          const isSelected = selectedStepId === step.id || selectedStepIds?.has(step.id);
          const isHighlighted = highlightStepId === step.id;
          const isSearchMatch = searchQuery && searchMatches.has(step.id);
          const isDimmed = searchQuery && !searchMatches.has(step.id);

          return (
            <button
              key={step.id}
              onClick={(e) => {
                e.stopPropagation();
                if (e.shiftKey && onToggleSelect) {
                  onToggleSelect(step.id);
                } else {
                  onSelectStep(step.id);
                }
              }}
              className={`
                absolute flex flex-col items-start justify-center
                rounded-lg border-2 px-3 py-2
                transition-all duration-150 cursor-pointer
                ${statusBorderClass(status)}
                ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-gray-950' : ''}
                ${isHighlighted ? 'ring-2 ring-yellow-500 ring-offset-1 ring-offset-gray-950' : ''}
                ${isSearchMatch ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-gray-950' : ''}
                ${isDimmed ? 'opacity-30' : 'opacity-100'}
                bg-gray-900 hover:bg-gray-800
              `}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                height: node.height,
              }}
            >
              <div className="flex items-center gap-2 w-full min-w-0">
                <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${visuals.bg} ${visuals.color}`}>
                  {visuals.shortLabel}
                </span>
                <span className="text-sm text-white truncate flex-1 min-w-0 text-left">
                  {step.name}
                </span>
              </div>
              {step.description && (
                <span className="text-xs text-gray-400 truncate w-full text-left mt-1">
                  {step.description}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Minimap — clickable to pan */}
      <div className="absolute bottom-3 right-3 z-10 bg-gray-800/80 border border-gray-700 rounded p-1">
        <svg
          width={120}
          height={80}
          viewBox={`0 0 ${layout.width || 1} ${layout.height || 1}`}
          className="block cursor-pointer"
          onClick={(e) => {
            const svg = e.currentTarget;
            const rect = svg.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * (layout.width || 1);
            const svgY = ((e.clientY - rect.top) / rect.height) * (layout.height || 1);
            // Center the viewport on the clicked point
            if (containerRef.current) {
              const vpW = containerRef.current.clientWidth / zoom;
              const vpH = containerRef.current.clientHeight / zoom;
              setPan({
                x: -(svgX - vpW / 2) * zoom,
                y: -(svgY - vpH / 2) * zoom,
              });
            }
          }}
        >
          {/* Edges */}
          {layout.edges.map(edge => (
            <line
              key={`mini-${edge.fromId}-${edge.toId}`}
              x1={edge.fromX}
              y1={edge.fromY}
              x2={edge.toX}
              y2={edge.toY}
              stroke="#4b5563"
              strokeWidth={4}
            />
          ))}
          {/* Nodes */}
          {Array.from(layout.nodes.values()).map(node => (
            <rect
              key={`mini-${node.id}`}
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={4}
              fill={selectedStepId === node.id ? '#3b82f6' : '#6b7280'}
              stroke="none"
            />
          ))}
          {/* Viewport rect */}
          {containerRef.current && (
            <rect
              x={-pan.x / zoom}
              y={-pan.y / zoom}
              width={containerRef.current.clientWidth / zoom}
              height={containerRef.current.clientHeight / zoom}
              fill="none"
              stroke="#60a5fa"
              strokeWidth={Math.max(2, 4 / zoom)}
              rx={2}
            />
          )}
        </svg>
      </div>
    </div>
  );
}
