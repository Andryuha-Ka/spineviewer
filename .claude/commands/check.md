# /check — TypeScript + Build Verification

Run both type-check and production build for the Spine Viewer Pro project.
Report all errors clearly. Do NOT fix errors automatically unless the user asks.

## Steps

1. Run `npx vue-tsc --noEmit` from the project root (`D:\tools\spine_viewer\spine_viewer_pro`).
   - Collect all TypeScript errors (file path + line + message).
   - vue-tsc is required (not plain tsc) because of `.vue` files.

2. Run `npx vite build` from the project root.
   - Collect all build errors.

3. Report results in this format:
   ```
   TypeScript: ✅ clean  (or ❌ N errors)
   Build:      ✅ clean  (or ❌ N errors)
   ```
   Then list each error grouped by file with the line number and message.
   If both pass — say "✅ All clear, ready for next step."
