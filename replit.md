# bilko-flow

## Overview
Typed DSL, determinism model, and planner protocol for deterministic workflow creation. The Express server is a library explorer — see README.md for full documentation.

## Running
```bash
npm install
npm run dev    # Start on port 5000
npm test       # Run test suite
npm run build  # Compile TypeScript
```

## Project Structure
- `src/domain/` — Core domain types (the library's primary export)
- `src/dsl/` — DSL compiler and validator
- `src/planner/` — Planner protocol and certification
- `src/engine/` — Reference executor
- `src/storage/` — Pluggable storage contracts
- `src/api/` — Reference REST API
- `tests/` — Jest test suite
