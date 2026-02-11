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

## Quick Start

```bash
npm install
npm test          # Run 87 tests across 10 suites
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

## License

MIT
