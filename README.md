# bilko-flow

A TypeScript library that defines the **typed DSL, determinism model, planner protocol, and RBAC system** for deterministic workflow creation — designed for consumption by AI agents and workflow orchestrators.

## What This Is

bilko-flow is a **library and protocol specification**, not a workflow execution engine.

The core value is the set of typed contracts and domain models that enable AI agents to:

- **Create workflows** via a validated DSL with determinism grades (Pure, Replayable, Best-Effort)
- **Plan and repair** workflows through the Planner protocol with certification
- **Track provenance** with SHA-256 hashing and HMAC-signed attestations
- **Enforce access control** via a hierarchical RBAC model (Org > Project > Environment)
- **Handle errors** through machine-actionable typed errors with suggested fixes

The included Express server is a **reference implementation and library explorer** — it showcases the library's capabilities but is not intended as a production execution engine. For production workflow execution, use established engines like Temporal, Inngest, or Step Functions, and integrate bilko-flow's DSL and planning protocols into your agent layer.

## Architecture

```
src/
  domain/         # Core domain types — the library's primary export
    workflow.ts   # DSL document model, steps, policies
    determinism.ts # Determinism grades, time sources, external deps
    provenance.ts # Execution transcripts, hash records
    attestation.ts # HMAC-signed integrity proofs
    rbac.ts       # Role-based access control model
    errors.ts     # Typed errors with machine-actionable suggested fixes
    ...

  dsl/            # DSL compiler and validator
    compiler.ts   # 5-phase compilation: validate > sort > compile > analyze > hash
    validator.ts  # Schema validation and determinism constraint checking

  planner/        # Planner protocol — the agent integration point
    interface.ts  # Planner contract (proposeWorkflow, proposePatch, proposeRepair)
    certification.ts # Planner conformance test suite
    default-planner.ts # Reference protocol implementation

  engine/         # Reference executor (library showcase)
    executor.ts   # Workflow orchestration with provenance and attestation
    step-runner.ts # Pluggable step handlers with retry/timeout policies
    state-machine.ts # Run/step state transition validation

  storage/        # Pluggable storage contracts
    store.ts      # 12 store interfaces with pagination support
    memory-store.ts # In-memory reference implementation

  api/            # Reference REST API (library explorer)
  notifications/  # Webhook delivery with HMAC signing
  data-plane/     # Event publication system
  audit/          # Immutable audit trail
```

## Key Concepts

### Determinism Model

Every workflow declares a target determinism grade:

- **Pure** — Outputs are a pure function of declared inputs. No time dependence, no external APIs.
- **Replayable** — External effects are controlled by capturing evidence for replay equivalence.
- **Best-Effort** — Execution is auditable but external dependencies may prevent strict replay.

Steps declare their determinism properties (`usesTime`, `usesExternalApis`, `pureFunction`), and the compiler validates these against the workflow's target grade. Runtime warnings are logged when step type heuristics conflict with declarations.

### Planner Protocol

The `Planner` interface defines how AI agents create and modify workflows:

```typescript
interface Planner {
  getVersionInfo(): PlannerVersionInfo;
  proposeWorkflow(goal: PlanGoal): Promise<WorkflowProposal>;
  proposePatch(workflow: Workflow, goal: PlanGoal): Promise<WorkflowPatch>;
  proposeRepair(context: RepairContext): Promise<WorkflowPatch>;
  explainPlan?(goal: PlanGoal): Promise<PlanExplanation>;
}
```

Planner outputs are treated as **untrusted until validated** through the DSL compiler and the `certifyPlanner()` conformance suite.

### Typed Error Model

Errors include machine-actionable remediation suggestions:

```typescript
interface TypedError {
  code: string;          // e.g., "STEP.HTTP.TIMEOUT"
  message: string;
  retryable: boolean;
  suggestedFixes: SuggestedFix[];  // e.g., INCREASE_TIMEOUT, PROVIDE_SECRET
}
```

This enables agent-driven error recovery loops where the planner's `proposeRepair()` consumes typed errors and produces targeted patches.

### Attestation and Provenance

Completed runs produce:
- **Provenance records** — SHA-256 hashes of workflow DSL, compiled plan, step inputs/outputs, and execution transcript
- **Attestations** — HMAC-signed statements over provenance data for integrity verification

## React UI Components

Import from `bilko-flow/react` for visualization components. All components are props-driven with no required React context.

### FlowProgress — Primary Progress Widget

The main progress visualization component. Supports **sequential** and **parallel** execution flows with four visual modes.

#### Sequential Flow (linear steps)

```tsx
import { FlowProgress } from 'bilko-flow/react';

<FlowProgress
  mode="expanded"
  steps={[
    { id: '1', label: 'Fetch Data', status: 'complete', type: 'http.search' },
    { id: '2', label: 'Transform', status: 'active', type: 'transform.map' },
    { id: '3', label: 'Summarize', status: 'pending', type: 'ai.summarize' },
  ]}
  label="Content Pipeline"
  status="running"
  activity="Transforming raw data..."
/>
```

#### Parallel Flow (fork-join with up to 5 threads)

When a flow forks into concurrent branches, pass `parallelThreads`:

```tsx
import { FlowProgress } from 'bilko-flow/react';
import type { ParallelThread } from 'bilko-flow/react';

const threads: ParallelThread[] = [
  {
    id: 'google', label: 'Google API', status: 'running',
    steps: [
      { id: 'g1', label: 'Query', status: 'complete', type: 'http.search' },
      { id: 'g2', label: 'Parse', status: 'active', type: 'transform.map' },
    ],
    activity: 'Parsing results...',
  },
  {
    id: 'bing', label: 'Bing API', status: 'complete',
    steps: [
      { id: 'b1', label: 'Query', status: 'complete', type: 'http.search' },
      { id: 'b2', label: 'Parse', status: 'complete', type: 'transform.map' },
    ],
  },
  {
    id: 'arxiv', label: 'ArXiv', status: 'running',
    steps: [
      { id: 'a1', label: 'Search', status: 'active', type: 'http.search' },
    ],
  },
];

<FlowProgress
  mode="expanded"
  steps={[{ id: 'init', label: 'Initialize', status: 'complete' }]}
  parallelThreads={threads}
  parallelConfig={{
    maxVisible: 5,           // Max 5 threads rendered (hard limit)
    autoCollapseCompleted: true,  // Auto-collapse finished threads
    autoCollapseDelayMs: 2000,    // Collapse after 2 seconds
  }}
  onThreadToggle={(threadId, collapsed) => console.log(threadId, collapsed)}
  status="running"
  label="Multi-Source Research"
/>
```

#### Visual Modes

| Mode | Width | Parallel Threads |
|------|-------|-----------------|
| `"compact"` | < 480px | Minimal indented rows with dot chains |
| `"expanded"` | 480–900px | Bordered lanes with step cards |
| `"full"` | > 900px | Full lanes with numbered circles |
| `"auto"` | Dynamic | Switches between expanded/compact |

#### Service Protection

- **Maximum 5 parallel threads** rendered simultaneously (`MAX_PARALLEL_THREADS`)
- Threads beyond the limit display as "+N more" overflow indicator
- Completed threads auto-collapse after configurable delay
- Error threads are never auto-collapsed (always visible for debugging)

### Other Components

| Component | Purpose | Min Area |
|-----------|---------|----------|
| `FlowCanvas` | Interactive 2D DAG visualization | 500×400px |
| `FlowTimeline` | Sidebar progress (compact wrapper) | 240×200px |
| `FlowCard` | Summary card for flow listing | 200×80px |
| `StepDetail` | Rich step inspection panel | 300×300px |
| `ComponentCatalog` | Browsable component catalog | 600×400px |

## Quick Start

```bash
npm install
npm test          # Run tests across all suites
npm run build     # Compile TypeScript
npm run dev       # Start reference server on port 5000
```

## Using as a Library

```typescript
import {
  Workflow, DeterminismGrade, DeterminismConfig,
  compileWorkflow, validateWorkflow,
  DefaultPlanner, certifyPlanner,
  createMemoryStore, WorkflowExecutor,
} from 'bilko-flow';

// Validate a workflow DSL document
const result = validateWorkflow(myWorkflow);

// Compile with determinism analysis
const compilation = compileWorkflow(myWorkflow);

// Use the planner protocol
const planner = new DefaultPlanner();
const proposal = await planner.proposeWorkflow({
  description: 'Process incoming data and generate summary',
  targetDslVersion: '1.0.0',
  determinismTarget: { targetGrade: DeterminismGrade.Replayable },
});

// Certify a planner implementation
const cert = await certifyPlanner(planner);
```

## Running Tests

```bash
npm test
```

Tests cover: DSL compilation and validation, state machine transitions, RBAC permission checking, planner certification, typed error creation, and API route behavior.

## LLM / Agent Authoring Guide

This library is purpose-built for AI agent consumption. Every public interface includes extensive JSDoc comments that serve as inline documentation for LLMs. Below is a structured guide for agents authoring flows and using UI components.

### Authoring a Flow Definition

```typescript
import type { FlowDefinition, FlowStep } from 'bilko-flow/react';

const flow: FlowDefinition = {
  id: 'research-pipeline',
  name: 'Research Pipeline',
  description: 'Search multiple sources, aggregate, and summarize',
  version: '1.0.0',
  tags: ['research', 'multi-source'],
  steps: [
    {
      id: 'init',
      name: 'Initialize',
      type: 'transform',
      description: 'Prepare search parameters',
      dependsOn: [],
    },
    {
      id: 'search',
      name: 'Search APIs',
      type: 'external-input',
      description: 'Query multiple search APIs in parallel',
      dependsOn: ['init'],
      parallel: true,  // Declares this step forks into parallel branches
    },
    {
      id: 'summarize',
      name: 'Summarize',
      type: 'llm',
      description: 'AI-powered summary of aggregated results',
      dependsOn: ['search'],
    },
  ],
};
```

### Visualizing a Parallel Flow

When a flow has steps that execute concurrently (e.g., querying 3 search APIs), model the parallel branches as `ParallelThread[]` and pass them to FlowProgress:

```typescript
import type { ParallelThread, FlowProgressStep } from 'bilko-flow/react';

// 1. Main chain: steps before and after the fork point
const mainSteps: FlowProgressStep[] = [
  { id: 'init', label: 'Initialize', status: 'complete' },
  // After all parallel threads complete, add join steps here
];

// 2. Parallel threads: concurrent branches
const threads: ParallelThread[] = [
  {
    id: 'google',
    label: 'Google Search',
    status: 'running',
    steps: [
      { id: 'g1', label: 'Query', status: 'complete', type: 'http.search' },
      { id: 'g2', label: 'Parse Results', status: 'active', type: 'transform.map' },
    ],
    activity: 'Processing 15 results...',
  },
  {
    id: 'bing',
    label: 'Bing Search',
    status: 'complete',
    steps: [
      { id: 'b1', label: 'Query', status: 'complete', type: 'http.search' },
      { id: 'b2', label: 'Parse Results', status: 'complete', type: 'transform.map' },
    ],
  },
  {
    id: 'arxiv',
    label: 'ArXiv Search',
    status: 'error',
    steps: [
      { id: 'a1', label: 'Query', status: 'error', type: 'http.search' },
    ],
    error: 'Rate limit exceeded',
  },
];
```

### LLM Sequence for Building a Parallel Progress UI

Follow this decision sequence when implementing a progress display:

1. **Assess the container** — Measure or estimate width. Pick mode:
   - < 480px → `"compact"` (or `"auto"` with default breakpoint)
   - 480–900px → `"expanded"` (or `"auto"`)
   - \> 900px → `"full"`

2. **Determine if parallelism exists** — Check `step.parallel` flags or
   if the execution engine reports concurrent step execution.

3. **If parallel** — Build `ParallelThread[]`:
   - Each concurrent branch becomes one `ParallelThread`
   - Thread `id` must be unique
   - Thread `status` tracks the branch's overall lifecycle
   - Thread `steps` are the branch's internal step chain

4. **Configure protection** — Set `parallelConfig`:
   - `maxVisible`: 1–5 (default 5, hard max 5)
   - `autoCollapseCompleted`: `true` for production UIs
   - `autoCollapseDelayMs`: 2000ms is sensible default

5. **Render** — Pass both `steps` (main chain) and `parallelThreads`
   to `<FlowProgress>`.

### Using Execution Hooks with Parallel Flows

```typescript
import { useFlowExecution } from 'bilko-flow/react';

// Parent execution manages the main flow
const parent = useFlowExecution({ store, flowId: 'research-pipeline' });

// Each parallel branch is a child execution
const googleExec = parent.spawnChild('google-search');
const bingExec = parent.spawnChild('bing-search');
const arxivExec = parent.spawnChild('arxiv-search');

// Convert child executions to ParallelThread[] for visualization
const threads: ParallelThread[] = [googleExec, bingExec, arxivExec].map(
  child => ({
    id: child.id,
    label: child.flowId,
    status: mapExecutionStatus(child.status),
    steps: Object.values(child.steps).map(step => ({
      id: step.stepId,
      label: step.stepId,
      status: mapStepStatus(step.status),
    })),
  })
);
```

### Theme Customization

```typescript
import { mergeTheme, DEFAULT_FLOW_PROGRESS_THEME } from 'bilko-flow/react';

// Partial override — only change what you need
const customTheme = mergeTheme({
  activeColor: 'bg-indigo-500',
  stepColors: {
    'http.search': 'bg-teal-500',
  },
});
```

### Key Constants and Limits

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_PARALLEL_THREADS` | 5 | Hard limit on rendered parallel threads |
| `DEFAULT_AUTO_BREAKPOINT` | 480px | Width threshold for auto mode switching |
| `DEFAULT_RADIUS` | 2 | Sliding window radius for step chain |
| Default auto-collapse delay | 2000ms | Time before completed threads collapse |

## License

MIT
