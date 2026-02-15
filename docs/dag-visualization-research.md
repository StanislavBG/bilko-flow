# DAG Visualization Libraries: Comprehensive Study

> Research study covering the top 10 most popular visualization libraries for directed acyclic graphs (DAGs), focusing on visualization components, customization properties, space optimization, and complex flow handling.

---

## Executive Summary

This study analyzes the top 10 DAG visualization libraries across the JavaScript/TypeScript ecosystem. The analysis focuses on four key dimensions:

1. **Visualization Components** -- What visual elements each library provides
2. **Customization Properties** -- How deeply the visual components can be themed and styled
3. **Space Optimization** -- How libraries handle layout algorithms, responsive design, and viewport management
4. **Complex Flow Handling** -- Support for multiple branches, nested sub-flows, and highly complex DAGs

### Key Findings

- **React Flow** leads in React ecosystem integration, but requires an external layout engine (dagre/ELK) for automatic DAG positioning
- **ELK.js** provides the best automatic hierarchical layout algorithms and serves as the layout backbone for many other libraries
- **AntV G6** offers the best performance for very large graphs via GPU/WASM-accelerated layout
- **Mermaid** dominates documentation-scale diagrams via its text-as-code approach
- **Cytoscape.js** has the richest set of built-in layout algorithms (13+) and graph theory operations
- **Auto-mode responsive switching** (adapting visualization mode to container width) is a pattern used by few libraries but delivers the best user experience -- bilko-flow's enhanced auto-mode addresses this gap

### Recommendations for bilko-flow

Based on this research, bilko-flow's enhanced auto-mode implements a **multi-breakpoint responsive system** inspired by:
- ELK.js's hierarchical layout awareness
- React Flow's viewport virtualization patterns
- Cytoscape.js's multi-algorithm approach to layout selection
- AntV G6's context-aware rendering (Canvas/SVG/WebGL selection based on graph size)

The key insight: the best visualization is not a single mode but an **adaptive system** that selects the optimal rendering mode based on container dimensions, step count, and flow complexity.

---

## Library Analysis

### 1. React Flow (xyflow)

| Property | Value |
|----------|-------|
| **Ecosystem** | React, Svelte (TypeScript) |
| **License** | MIT |
| **GitHub Stars** | ~26,000+ |
| **npm Weekly Downloads** | ~847,000 |
| **Website** | [reactflow.dev](https://reactflow.dev) |

#### Visualization Components
- Fully customizable nodes (any React component can serve as a node)
- Edge types: straight, step, bezier, smoothstep with custom path rendering
- Multiple handles (connection points) per node with configurable positioning
- Groups/sub-flows via parent-child node nesting
- Built-in plugins: MiniMap, Controls, Background patterns

#### Customization Properties
- Nodes are React components with unlimited customization (colors, shapes, images, forms, buttons)
- Edge styling: stroke color, width, animation, markers (arrowheads), custom labels
- User-defined themes via CSS; supports dark mode
- Data-driven styling via node/edge data properties

#### Space Optimization
- **No built-in layout algorithm** -- requires external layout engine (dagre, ELK.js, or headless Cytoscape.js)
- Viewport virtualization: only renders nodes visible in the viewport
- Smooth zoom/pan with animation, fitView, and centering utilities
- Responsive containers with automatic viewport adjustment

#### Complex Flow Handling
- Handles multiple branches and parallel paths via graph data model
- Nested sub-flows via grouping (parent-child node hierarchy)
- No native cycle detection -- DAG constraints must be enforced in the data model
- Supports thousands of nodes with proper optimization (memoized props, edge bundling)

#### Key Differentiators
- Best-in-class React integration: nodes ARE React components
- Ideal for interactive workflow editors, pipeline builders, no-code tools
- Commercial backing (xyflow team) ensures active development
- Svelte Flow variant available for Svelte applications

#### Relevance to bilko-flow
React Flow's approach of decoupling rendering from layout is architecturally similar to bilko-flow's separation of `computeLayout()` (pure layout) from `FlowCanvas` (React rendering). Its viewport virtualization pattern informs how bilko-flow handles large step counts in the sliding window.

---

### 2. Mermaid

| Property | Value |
|----------|-------|
| **Ecosystem** | JavaScript (framework-agnostic, Markdown-based) |
| **License** | MIT (commercial: Mermaid Chart) |
| **GitHub Stars** | ~74,000--86,000 |
| **npm Weekly Downloads** | ~1,200,000--3,350,000 |
| **Website** | [mermaid.js.org](https://mermaid.js.org/) |

#### Visualization Components
- Flowcharts with 30+ node shapes, subgraphs, edge labels, icons, and images
- Multi-diagram support: sequence, class, state, Gantt, ER, pie, mindmap, and more
- Markdown-compatible text inside nodes and labels

#### Customization Properties
- Built-in themes: default, dark, forest, neutral
- Custom theme variables for colors, fonts, line widths
- Flowchart "looks" (hand-drawn vs. classic style)
- Limited fine-grained control compared to programmatic libraries

#### Space Optimization
- **Dagre** as default layout engine (automatic hierarchical layout)
- **ELK** layout available as opt-in extension for complex/large diagrams
- Auto-layout only -- no manual positioning; direction control (TB, BT, LR, RL)
- No built-in zoom/pan (depends on rendering context)

#### Complex Flow Handling
- Subgraphs for organizing complex flows
- Works well for small-to-medium DAGs; layout becomes chaotic with large, complex graphs
- No cycle detection -- cycles cause rendering issues

#### Key Differentiators
- Text-as-code approach: diagrams defined in Markdown-like syntax
- Widest platform integration (GitHub, GitLab, Notion, Confluence, Obsidian)
- Lowest barrier to entry -- no programming required
- Best for documentation and static diagram generation

#### Relevance to bilko-flow
Mermaid's text-based approach to graph definition parallels bilko-flow's DSL compiler. The insight that auto-layout must handle different diagram sizes differently (dagre for simple, ELK for complex) directly informs the multi-breakpoint auto-mode design.

---

### 3. Cytoscape.js

| Property | Value |
|----------|-------|
| **Ecosystem** | JavaScript (framework-agnostic; React wrapper available) |
| **License** | MIT |
| **GitHub Stars** | ~10,850 |
| **npm Weekly Downloads** | ~3,500,000 |
| **Website** | [js.cytoscape.org](https://js.cytoscape.org/) |

#### Visualization Components
- Nodes: ellipse, rectangle, triangle, pentagon, hexagon, barrel, rhomboid, and more
- Compound (parent) nodes for hierarchical grouping
- Edges: bezier curves, straight lines, haystack, unbundled bezier, segments
- Edge labels, arrowheads, and multigraph support

#### Customization Properties
- CSS-like stylesheet system for all visual properties
- Data-driven styling (map node data to visual properties)
- Built-in highlighters, selectors, and element classes
- Full control over colors, borders, opacity, sizes, fonts, padding

#### Space Optimization
- **13+ built-in layout algorithms**: grid, circle, concentric, breadthfirst, cose, cola, dagre, ELK, klay, cise, avsdf, and more
- `cytoscape.js-dagre` extension specifically for DAG/tree layouts
- Zoom, pan, fit-to-viewport, and bounding box controls
- Can run **headless** purely for layout computation

#### Complex Flow Handling
- Compound/nested nodes for hierarchical grouping
- Built-in graph theory algorithms: BFS, DFS, shortest path, MST, PageRank, betweenness centrality
- No native DAG enforcement, but graph algorithms can detect cycles
- Canvas-based rendering handles several thousand nodes

#### Key Differentiators
- Most comprehensive graph theory library -- full analysis capabilities
- Richest set of built-in layout algorithms
- Can run headless as a layout engine for other libraries
- Strong academic pedigree (bioinformatics, network analysis)

#### Relevance to bilko-flow
Cytoscape.js's multi-algorithm approach -- selecting different layout algorithms based on graph characteristics -- directly inspires bilko-flow's auto-mode multi-breakpoint system. The concept of choosing `breadthfirst` for trees vs `dagre` for DAGs vs `cose` for general graphs maps to choosing `vertical` for narrow containers vs `expanded` for medium vs `full` for wide.

---

### 4. AntV G6

| Property | Value |
|----------|-------|
| **Ecosystem** | JavaScript/TypeScript (framework-agnostic) |
| **License** | MIT |
| **GitHub Stars** | ~11,837 |
| **npm Weekly Downloads** | ~161,000 |
| **Website** | [g6.antv.antgroup.com](https://g6.antv.antgroup.com/en) |

#### Visualization Components
- Rich built-in node types, edge types, and "Combos" (compound/grouped nodes)
- Labels with customizable positioning and styling
- Badges, icons, images inside nodes
- TreeGraph mode for hierarchical data
- 3D nodes and edges via `@antv/g6-extension-3d`

#### Customization Properties
- Extensive style configurations with data callback support
- Two built-in themes (light/dark) with 20+ community color palettes
- Custom element extension mechanism for new node/edge types
- Animation support for state transitions and layout changes
- React node support -- render React components as G6 nodes

#### Space Optimization
- **13+ built-in layout algorithms**: dagre, antv-dagre (enhanced), force, circular, radial, grid, concentric, MDS, fruchterman, d3-force, combo-combined
- **GPU-accelerated layouts** via `@antv/layout-gpu` (WebGPU)
- **Rust/WASM layouts** via `@antv/layout-wasm` for high performance
- Zoom, pan, fitView, fisheye lens plugin, minimap plugin

#### Complex Flow Handling
- Combos (compound nodes) for hierarchical grouping
- 10+ built-in interaction behaviors
- Graph analysis algorithms built in
- Plugin architecture: tooltip, context menu, legend, toolbar, minimap

#### Key Differentiators
- **GPU and WASM-accelerated layouts** -- unique performance capabilities
- Multi-renderer (Canvas/SVG/WebGL/3D) based on graph characteristics
- Strongest performance for very large graphs (10,000+ nodes)
- Backed by Ant Group's engineering team

#### Relevance to bilko-flow
G6's context-aware renderer selection (Canvas for simple, WebGL for large) mirrors the auto-mode concept: select the rendering approach based on the data characteristics. The step-count awareness in bilko-flow's auto-mode is directly inspired by this pattern.

---

### 5. GoJS

| Property | Value |
|----------|-------|
| **Ecosystem** | JavaScript/TypeScript (React, Angular, Vue wrappers) |
| **License** | Commercial ($3,495--$9,950+) |
| **GitHub Stars** | ~8,200 |
| **npm Weekly Downloads** | ~66,000 |
| **Website** | [gojs.net](https://gojs.net/latest/) |

#### Visualization Components
- Nodes with shapes, text, images, panels, and ports
- Links with orthogonal/bezier/straight routing, arrowheads, labels
- Link-to-link connections for complex relationships
- Groups (collapsible), adornments, tooltips, context menus
- Palettes for drag-and-drop and overview panel (minimap)

#### Customization Properties
- Template-based system with data binding
- Full control over shapes, colors, fonts, gradients, shadows
- Animation support for transitions and highlighting
- Built-in undo/redo, clipboard, keyboard shortcuts
- Export to SVG, PNG, PDF

#### Space Optimization
- Built-in layouts: TreeLayout, ForceDirectedLayout, CircularLayout, **LayeredDigraphLayout** (Sugiyama for DAGs), GridLayout
- Auto-layout with manual override
- Zoom, pan, scroll, fit-to-page, responsive options

#### Complex Flow Handling
- LayeredDigraphLayout handles highly complex multi-branch DAGs
- Collapsible groups/sub-graphs
- Link validation to enforce DAG constraints
- Transaction-based model updates

#### Key Differentiators
- Most mature commercial library (10+ years, enterprise-proven)
- 200+ sample applications
- Best documentation of any library
- Professional support from the engineering team
- No dependencies -- fully self-contained

#### Relevance to bilko-flow
GoJS's LayeredDigraphLayout (Sugiyama algorithm) is architecturally similar to bilko-flow's `computeLayout()` function. The template-based customization system parallels bilko-flow's `stepRenderer` prop pattern.

---

### 6. ELK.js (Eclipse Layout Kernel)

| Property | Value |
|----------|-------|
| **Ecosystem** | JavaScript/TypeScript (pure layout engine) |
| **License** | EPL (Eclipse Public License) |
| **GitHub Stars** | ~2,348 |
| **npm Weekly Downloads** | ~533,000 |
| **Website** | [eclipse.dev/elk](https://eclipse.dev/elk/) |

#### Visualization Components
- **Not a rendering library** -- pure layout computation engine
- Computes: node positions, edge routes (with bend points), port positions, label positions
- Pairs with React Flow, Cytoscape.js, D3, or any rendering layer

#### Customization Properties
- Hundreds of layout parameters: node spacing, edge spacing, layer spacing, direction (TB/BT/LR/RL)
- Port alignment and edge routing style configuration
- Node ordering strategies
- Hierarchical (compound) node layout support

#### Space Optimization
- **Best-in-class automatic layout for DAGs** (layered/Sugiyama algorithm)
- Additional algorithms: stress, force, tree, radial, disco (disconnected components)
- Handles hierarchical/nested graphs natively
- Compact layout with configurable spacing and aspect ratios
- Port constraints for edge attachment points

#### Complex Flow Handling
- Designed for complex, multi-branch directed graphs with ports
- Handles nested/hierarchical graphs (graphs within graphs)
- Sophisticated edge routing that avoids node overlap
- Layer assignment, crossing minimization, and node placement optimizations

#### Key Differentiators
- The gold standard for hierarchical/DAG layout algorithms
- Port support is unmatched: explicit edge attachment points
- Hierarchical compound graph layout is a first-class feature
- Academic foundation with published research
- Web Worker support prevents UI freezing

#### Relevance to bilko-flow
ELK.js's Sugiyama algorithm is the same class of algorithm used in bilko-flow's `computeLayout()`. The concept of port-based edge routing could enhance bilko-flow's `FlowCanvas` edge rendering. ELK's approach to handling nested/hierarchical graphs informs how parallel threads could be visualized as sub-graphs.

---

### 7. Dagre / dagre-d3

| Property | Value |
|----------|-------|
| **Ecosystem** | JavaScript (framework-agnostic) |
| **License** | MIT |
| **GitHub Stars** | ~5,500 (dagre) + ~3,000 (dagre-d3) |
| **npm Weekly Downloads** | High (transitive dependency in Mermaid, Cytoscape.js-dagre, etc.) |

#### Visualization Components
- **dagre**: Pure layout engine (computes positions and edge routes)
- **dagre-d3**: SVG rendering via D3.js with rectangular/elliptical nodes, edge labels, arrowheads
- Custom node shapes via D3

#### Customization Properties
- dagre-d3 supports custom node shapes, edge styles, labels, CSS classes
- Limited compared to modern libraries -- D3/SVG-based styling
- No built-in themes or animation support

#### Space Optimization
- Sugiyama algorithm for layered graph layout
- Configurable rankdir (TB/BT/LR/RL), node/edge/rank separation
- Compact, clean hierarchical layouts

#### Complex Flow Handling
- Handles multi-branch DAGs with Sugiyama algorithm
- Compound (clustered) nodes via graphlib
- Limited interactivity -- primarily static layout

#### Key Differentiators
- The foundational DAG layout library that many others build upon
- Simple API with minimal configuration
- Lightweight and focused
- **In maintenance mode** -- dagre-d3 last published 6+ years ago

#### Relevance to bilko-flow
Dagre's Sugiyama algorithm is the direct ancestor of bilko-flow's `computeLayout()`. The column-assignment via topological sort and barycenter heuristic for row ordering are the same techniques. ELK.js is recommended as the modern successor for more advanced layout needs.

---

### 8. d3-dag

| Property | Value |
|----------|-------|
| **Ecosystem** | JavaScript/TypeScript (D3.js ecosystem) |
| **License** | MIT |
| **GitHub Stars** | ~1,481 |
| **npm Weekly Downloads** | ~21,000 |
| **Website** | [erikbrinkman.github.io/d3-dag](https://erikbrinkman.github.io/d3-dag/) |

#### Visualization Components
- Pure layout engine -- computes coordinates for nodes and control points for links
- Rendering via D3.js or any other library
- Graph data structures for manipulating DAG topology

#### Customization Properties
- Configurable layout parameters: node size, layer assignment strategy, crossing minimization, coordinate assignment
- Rendering customization depends entirely on the paired rendering library

#### Space Optimization
- **Four layout algorithms**: Sugiyama (layered), Zherebko (linear topological), Grid (grid topological), Dynamic Sugiyama (interactive)
- Multiple graph construction methods: graphHierarchy, graphStratify, graphConnect, graphJson
- Designed specifically for DAGs (unlike d3-hierarchy for trees)

#### Complex Flow Handling
- Designed for DAG data that is hierarchical but not tree-structured
- Handles multi-parent relationships natively
- Multiple topological ordering strategies

#### Key Differentiators
- **Purpose-built for DAGs** -- designed exclusively for non-tree hierarchical data
- Zherebko layout: unique compact linear layout not found elsewhere
- **Light maintenance mode** -- limited new feature development

#### Relevance to bilko-flow
d3-dag's Zherebko layout (compact linear topological ordering) could inform a future compact DAG visualization mode in bilko-flow. The concept of multiple layout strategies for the same data (Sugiyama for readability, Zherebko for compactness) directly parallels bilko-flow's multi-mode approach.

---

### 9. JointJS / JointJS+

| Property | Value |
|----------|-------|
| **Ecosystem** | JavaScript/TypeScript (React, Angular, Vue integrations) |
| **License** | MPL 2.0 (open source core); JointJS+ commercial ($2,990+) |
| **GitHub Stars** | ~5,170 |
| **npm Weekly Downloads** | ~20,700 |
| **Website** | [jointjs.com](https://www.jointjs.com/) |

#### Visualization Components
- SVG-based rendering with customizable shapes
- Links with vertices, labels, arrowheads, configurable routing (orthogonal, manhattan, metro)
- Ports (explicit connection points on nodes)
- Groups, highlighters, embedded elements
- JointJS+: toolbar, inspector, stencil/palette, navigator (minimap)

#### Customization Properties
- Shape templates via SVG markup and attributes
- Full control over colors, gradients, filters, fonts, borders
- Highlighters for visual emphasis
- JointJS+: BPMN shapes, record shapes, charts, Visio import/export

#### Space Optimization
- DAG layout via dagre integration (DirectedGraph plugin)
- ELK layout integration for sophisticated hierarchical layouts
- Port layout with label positioning
- JointJS+ (v4.0): "guided layout-driven positioning"
- Zoom, pan, fit-to-content, paper scroller

#### Complex Flow Handling
- Multi-branch flows via dagre/ELK-based layout
- Embedded (nested) elements for hierarchical grouping
- Link validation for enforcing connection rules
- Undo/redo for interactive editing
- BPMN 2.0 support for standardized workflow modeling

#### Key Differentiators
- Most enterprise-ready open source option
- Native Visio VSDX import/export and BPMN 2.0 XML support
- ELK layout integration
- Layers API for organizing complex diagram elements
- 170+ demo applications

#### Relevance to bilko-flow
JointJS's port-based connection model and BPMN workflow support represent enterprise use cases bilko-flow could address. The link routing algorithms (orthogonal, manhattan, metro) could enhance edge rendering in FlowCanvas.

---

### 10. Graphviz / Viz.js

| Property | Value |
|----------|-------|
| **Ecosystem** | C (core), JavaScript/WebAssembly (viz.js) |
| **License** | EPL 1.0 |
| **GitHub Stars** | ~4,300 (viz-js) |
| **npm Weekly Downloads** | ~30,500 |
| **Website** | [graphviz.org](https://www.graphviz.org/) / [viz-js.com](https://viz-js.com/) |

#### Visualization Components
- Extensive node shape library: record, Mrecord, box, circle, ellipse, diamond, polygon
- Edges with labels, arrowhead styles, colors, pen widths
- Clusters (subgraphs) with labels and borders
- Tables within nodes (HTML-like labels)
- Output formats: SVG, PNG, PDF, PS

#### Customization Properties
- DOT language attribute control: colors, fonts, sizes, styles, URLs, tooltips, gradients
- Standard geometric shapes and record-based tabular layouts
- Edge styling: dashed, dotted, bold, tapered, multiple arrowhead styles
- Custom shapes via SVG or PostScript

#### Space Optimization
- **Multiple layout engines**: `dot` (hierarchical/DAG), `neato` (spring model), `fdp` (force-directed), `sfdp` (scalable force-directed), `twopi` (radial), `circo` (circular), `osage` (clustered), `patchwork` (treemap)
- `dot` engine specifically designed for DAGs with clean layered layouts
- Automatic edge routing with node overlap avoidance
- Rank constraints for fine-tuned layer control

#### Complex Flow Handling
- `dot` engine handles complex multi-branch DAGs with crossing minimization
- Subgraph clusters for grouping
- Rank constraints (`same`, `min`, `max`, `source`, `sink`) for precise control
- Invisible edges and constraint edges for layout fine-tuning

#### Key Differentiators
- The original DAG visualization tool -- `dot` layout algorithm is the reference implementation
- DOT language is a de facto standard for graph description
- Best for static, publication-quality rendering
- Cross-platform: bindings for Python, Ruby, Java, C#, Go, and more
- `d3-graphviz` adds animated transitions between graph states

#### Relevance to bilko-flow
Graphviz's `dot` algorithm is the intellectual ancestor of all modern Sugiyama-based layouts including bilko-flow's `computeLayout()`. Its rank constraint system could inspire bilko-flow's phase/stage grouping. The multi-engine approach (different algorithms for different graph types) directly parallels the auto-mode concept.

---

## Comparative Analysis

### Summary Table

| # | Library | Stars | npm/wk | Built-in DAG Layout | Interactive | Performance (Large) | Open Source |
|---|---------|-------|--------|---------------------|-------------|---------------------|-------------|
| 1 | React Flow | ~26K | ~847K | No (needs dagre/ELK) | Excellent | Good (virtualized) | MIT |
| 2 | Mermaid | ~80K | ~1.2M+ | Yes (dagre, ELK) | Minimal | Fair | MIT |
| 3 | Cytoscape.js | ~10.8K | ~3.5M | Yes (13+ algorithms) | Good | Good (Canvas) | MIT |
| 4 | AntV G6 | ~11.8K | ~161K | Yes (13+, GPU/WASM) | Excellent | Best (GPU/WASM) | MIT |
| 5 | GoJS | ~8.2K | ~66K | Yes (LayeredDigraph) | Excellent | Excellent | Commercial |
| 6 | ELK.js | ~2.3K | ~533K | Yes (best Sugiyama) | N/A (layout) | Good (Web Workers) | EPL |
| 7 | Dagre | ~5.5K | high | Yes (Sugiyama) | N/A (layout) | Fair | MIT |
| 8 | d3-dag | ~1.5K | ~21K | Yes (Sugiyama+) | N/A (layout) | Fair | MIT |
| 9 | JointJS | ~5.2K | ~21K | Yes (dagre/ELK) | Good | Good | MPL 2.0 |
| 10 | Graphviz | ~4.3K | ~30K | Yes (dot engine) | Minimal | Fair (WASM) | EPL |

### Space Optimization Comparison

| Library | Auto-Layout | Manual Position | Zoom/Pan | Virtualization | Responsive |
|---------|------------|-----------------|----------|----------------|------------|
| React Flow | External only | Yes | Yes | Yes | Yes |
| Mermaid | Yes (dagre/ELK) | No | Depends | No | Limited |
| Cytoscape.js | Yes (13+) | Yes | Yes | No | Yes |
| AntV G6 | Yes (13+) | Yes | Yes | Partial | Yes |
| GoJS | Yes (built-in) | Yes | Yes | Yes | Yes |
| ELK.js | Yes (best) | N/A | N/A | N/A | N/A |
| Dagre | Yes (Sugiyama) | N/A | N/A | N/A | N/A |
| d3-dag | Yes (4 algorithms) | N/A | N/A | N/A | N/A |
| JointJS | Yes (dagre/ELK) | Yes | Yes | Partial | Yes |
| Graphviz | Yes (multi-engine) | No | No | No | No |

### Complex Flow Handling Comparison

| Library | Multiple Branches | Nested/Grouped | Parallel Threads | Cycle Detection |
|---------|-------------------|----------------|------------------|-----------------|
| React Flow | Yes | Yes (groups) | Via data model | No |
| Mermaid | Yes | Yes (subgraphs) | No | No |
| Cytoscape.js | Yes | Yes (compound) | Via data model | Yes (algorithms) |
| AntV G6 | Yes | Yes (combos) | Via data model | Yes (algorithms) |
| GoJS | Yes | Yes (groups) | Via data model | Yes (validation) |
| ELK.js | Yes | Yes (hierarchical) | Via data model | No |
| Dagre | Yes | Yes (clusters) | Via data model | No |
| d3-dag | Yes | Limited | Via data model | No |
| JointJS | Yes | Yes (embedded) | Via data model | Yes (validation) |
| Graphviz | Yes | Yes (clusters) | Via data model | No |

---

## Key Insights for bilko-flow

### 1. Multi-Mode Auto-Selection is the Right Approach

No library in this study implements an intelligent multi-breakpoint mode switching system that adapts between vertical, compact, expanded, full, and pipeline modes based on container dimensions. This is a gap that bilko-flow's enhanced auto-mode fills.

The closest parallels are:
- **AntV G6**: Selects renderer (Canvas/SVG/WebGL) based on graph size
- **Cytoscape.js**: Different layout algorithms for different graph characteristics
- **Graphviz**: Different layout engines (`dot`, `neato`, `fdp`) for different graph types

bilko-flow's enhanced auto-mode brings this concept to the **rendering mode** level: selecting the optimal visual representation based on available space and flow complexity.

### 2. Step-Count Awareness Matters

Libraries that perform well with large graphs (AntV G6, Cytoscape.js, GoJS) all adapt their rendering strategy based on node count. bilko-flow's auto-mode incorporates step-count awareness:
- Few steps + wide container = full mode (high visual impact)
- Many steps + medium container = expanded mode (information density)
- Parallel threads = modes that support thread rendering (compact/expanded/full)

### 3. Layout Algorithm Separation is Proven

The separation of layout computation from rendering is a proven pattern used by ELK.js, dagre, d3-dag, and Cytoscape.js (headless mode). bilko-flow's `computeLayout()` function follows this exact pattern, making the layout engine reusable across different visualization modes.

### 4. Parallel Thread Visualization is Underserved

Among the top 10 libraries, none provide first-class parallel thread visualization (fork/join indicators, auto-collapsing completed threads, thread lane stacking). bilko-flow's `ParallelThreadsSection` component is a differentiator that addresses a real gap in the ecosystem.

### 5. Responsive Mode Switching is Rare

Most libraries expect the developer to choose a fixed visualization mode. The concept of dynamically switching between modes based on container width is implemented by very few libraries. bilko-flow's auto-mode with multi-breakpoint support makes this automatic and configurable.

---

## Implementation: Enhanced Auto-Mode

Based on the research findings, the enhanced auto-mode implements:

### Multi-Breakpoint Resolution

```
Container Width:  0 ──── 480px ──── 640px ──── 900px ──── ...
                  │       │         │         │
Resolved Mode:  vertical compact  expanded   full
```

### Context-Aware Selection

The auto-mode resolution considers:
1. **Container width** (primary factor) -- 4-tier breakpoint system
2. **Parallel thread presence** -- avoids modes that don't support thread rendering
3. **Pipeline configuration** -- auto-selects pipeline mode when explicitly configured
4. **Backwards compatibility** -- `autoBreakpoint` prop maps to the compact threshold

### Implementation Details

- Pure `resolveAutoMode()` function for testability and reuse
- `AutoModeConfig` type for granular breakpoint customization
- ResizeObserver integration for live container tracking
- Default mode changed to `auto` in documentation and examples

See `src/react/flow-progress-shared.ts` for the resolution algorithm and `src/react/flow-progress.tsx` for the React integration.
