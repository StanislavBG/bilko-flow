# bilko-flow

A TypeScript library for **VibeCoders and their AI agents** to design, validate, and execute deterministic workflows. Agents read the typed DSL, propose workflow definitions from natural-language goals, and the library validates, compiles, and executes them with determinism guarantees.

## What This Is

bilko-flow is a **pure library** — import it into your project and use its APIs programmatically. There is no server, no CLI, no SaaS layer.

The core value is the set of typed contracts and domain models that enable AI agents to:

- **Generate workflows from text** — Describe what you want in natural language; the `LLMPlanner` produces a validated DSL document
- **Create workflows** via a validated DSL with determinism grades (Pure, Replayable, Best-Effort)
- **Plan and repair** workflows through the Planner protocol with certification
- **Track provenance** with SHA-256 hashing and HMAC-signed attestations
- **Enforce access control** via a hierarchical RBAC model (Org > Project > Environment)
- **Handle errors** through machine-actionable typed errors with suggested fixes
- **Visualize flows** with React components (FlowProgress, FlowCanvas, FlowTimeline)

## Install

```bash
npm install bilko-flow
```

## Flow Generation: Text to Pipeline

The headline feature for VibeCoders: **describe a workflow in plain text and get a validated pipeline back.**

This is powered by the **Planner protocol** — specifically the `LLMPlanner` class, which wraps any LLM provider (Claude, GPT, Gemini, Ollama, etc.) and translates natural-language goals into Bilko DSL documents.

### How It Works

```
User text → PlanGoal → LLMPlanner.proposeWorkflow()
  → builds structured prompt with DSL schema + step types
  → chatJSON() → LLM provider (Claude, GPT, Ollama, etc.)
  → JSON response → WorkflowProposal
  → DSL compiler validates → accepted or rejected
```

### Quick Example

```typescript
import {
  LLMPlanner,
  registerLLMAdapter,
  compileWorkflow,
  validateWorkflow,
} from 'bilko-flow';

// 1. Register your LLM provider adapter
registerLLMAdapter('claude', myClaudeAdapter);

// 2. Create a planner
const planner = new LLMPlanner({
  provider: 'claude',
  model: 'claude-sonnet-4-5-20250929',
  apiKey: process.env.ANTHROPIC_API_KEY!,
  temperature: 0.2,
});

// 3. Describe your workflow in plain text
const proposal = await planner.proposeWorkflow({
  description: 'Search the web for articles about AI, filter by relevance, summarize the top results, and email a digest',
  targetDslVersion: '1.0.0',
  determinismTarget: { targetGrade: 'best-effort' },
});

// 4. Validate and compile the generated workflow
const validation = validateWorkflow(proposal);
const compiled = compileWorkflow(proposal);
// → Ready to execute
```

### The Planner Protocol

The `Planner` interface defines four operations:

| Method | What it does |
|---|---|
| `proposeWorkflow(goal)` | Natural-language description → complete workflow DSL document |
| `proposePatch(workflow, goal)` | Modify an existing workflow based on a text description |
| `proposeRepair(context)` | Given typed errors from a failed run, propose fixes as a patch |
| `explainPlan(goal)` | Return reasoning steps and confidence level |

All planner outputs are **untrusted until validated** through the DSL compiler. The library treats LLM output the same way it treats any external input — validate first, accept second.

### Two Planner Implementations

| Planner | Purpose |
|---|---|
| `LLMPlanner` | Production planner backed by any LLM (Claude, GPT, Gemini, Ollama, vLLM, TGI, LocalAI) |
| `DefaultPlanner` | Reference implementation for protocol conformance testing |

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

  dsl/            # DSL compiler and validator
    compiler.ts   # 5-phase compilation: validate > sort > compile > analyze > hash
    validator.ts  # Schema validation and determinism constraint checking

  planner/        # Planner protocol — the agent integration point
    interface.ts  # Planner contract (proposeWorkflow, proposePatch, proposeRepair)
    certification.ts # Planner conformance test suite
    default-planner.ts # Reference protocol implementation

  llm/            # LLM integration for text-to-pipeline generation
    llm-planner.ts # LLM-backed planner (text → workflow DSL)
    adapters/     # Pluggable adapters: Ollama, vLLM, TGI, LocalAI
    model-registry.ts # Supported model registry
    streaming.ts  # Streaming response support

  engine/         # Reference executor
    executor.ts   # Workflow orchestration with provenance and attestation
    step-runner.ts # Pluggable step handlers with retry/timeout policies
    state-machine.ts # Run/step state transition validation

  storage/        # Pluggable storage contracts
    store.ts      # 12 store interfaces with pagination support
    memory-store.ts # In-memory reference implementation

  react/          # React UI components for workflow visualization
  notifications/  # Webhook delivery with HMAC signing
  data-plane/     # Event publication system
```

## Key Concepts

### Determinism Model

Every workflow declares a target determinism grade:

- **Pure** — Outputs are a pure function of declared inputs. No time dependence, no external APIs.
- **Replayable** — External effects are controlled by capturing evidence for replay equivalence.
- **Best-Effort** — Execution is auditable but external dependencies may prevent strict replay.

Steps declare their determinism properties (`usesTime`, `usesExternalApis`, `pureFunction`), and the compiler validates these against the workflow's target grade.

### Typed Error Model

Errors include machine-actionable remediation suggestions, enabling agent-driven error recovery loops:

```typescript
interface TypedError {
  code: string;          // e.g., "STEP.HTTP.TIMEOUT"
  message: string;
  retryable: boolean;
  suggestedFixes: SuggestedFix[];  // e.g., INCREASE_TIMEOUT, PROVIDE_SECRET
}
```

The planner's `proposeRepair()` consumes typed errors and produces targeted patches automatically.

### Attestation and Provenance

Completed runs produce:
- **Provenance records** — SHA-256 hashes of workflow DSL, compiled plan, step inputs/outputs, and execution transcript
- **Attestations** — HMAC-signed statements over provenance data for integrity verification

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

## React UI Components

Import from `bilko-flow/react` for visualization components. All components are props-driven with no required React context.

### FlowProgress — Primary Progress Widget

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

### Other Components

| Component | Purpose | Min Area |
|-----------|---------|----------|
| `FlowCanvas` | Interactive 2D DAG visualization | 500x400px |
| `FlowTimeline` | Sidebar progress (compact wrapper) | 240x200px |
| `FlowCard` | Summary card for flow listing | 200x80px |
| `StepDetail` | Rich step inspection panel | 300x300px |
| `ComponentCatalog` | Browsable component catalog | 600x400px |

## Running Tests

```bash
npm test          # Run all 673 tests across 44 suites
npm run build     # Compile TypeScript
npm run lint      # Type-check without emit
```

## License

Proprietary — All rights reserved. See [LICENSE](./LICENSE) for details.
