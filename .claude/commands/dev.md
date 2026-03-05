# /dev — Start Dev Server

Start the Vite development server and report the local URL.

## Steps

1. Run `npx vite` from `D:\tools\spine_viewer\spine_viewer_pro`.
   - If port 5173 is busy, Vite will pick the next available port automatically.

2. Wait for the "ready in Xms" message.

3. Report the local URL to the user, e.g.:
   ```
   Dev server running → http://localhost:5173
   ```

4. If there are any startup errors (plugin errors, config errors) — show them immediately
   and suggest fixes. Common issues:
   - esbuild pre-bundling errors from @esotericsoftware → check `optimizeDeps.exclude` in vite.config.ts
   - Port conflict → kill the process on that port or use a different one
