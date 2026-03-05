# /next-step — Implement Next Plan Step

Find the next incomplete step in PLAN.md and implement it using the Plan agent first.

## Process

1. Read `PLAN.md` from the project root.
   - Find the **first step** that is NOT marked ✅ in the memory file (`MEMORY.md`).
   - Current progress is tracked in `C:\Users\akarpus\.claude\projects\D--tools-spine-viewer-spine-viewer-pro\memory\MEMORY.md`.

2. **Launch the Plan agent** with this context:
   - The step title and full task list from PLAN.md
   - Relevant existing files (read them first with Explore agent if needed)
   - Architecture constraints from MEMORY.md (adapter pattern, store conventions, etc.)
   - Ask the Plan agent to produce a concrete implementation plan:
     - Which files to create / modify
     - Order of operations
     - Potential pitfalls (type conflicts, version-specific quirks)

3. **Present the plan** to the user for approval before writing any code.

4. After approval — implement step by step, running `/check` at the end.

5. Update `MEMORY.md` progress section: mark the step ✅.

## Project conventions to follow

- Stores: `src/core/stores/use<Name>Store.ts` — Pinia composition API style
- Components: `src/components/<panels|pages|stage>/<Name>.vue` — `<script setup lang="ts">`
- Adapters: never import both pixi7 and pixi8 in the same file
- Auto-imports active: `ref`, `computed`, `watch`, `onMounted`, `defineStore` — no manual imports needed in `.vue` / `.ts`
- Naive UI components are auto-imported — no manual imports needed
