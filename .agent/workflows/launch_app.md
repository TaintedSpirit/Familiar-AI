---
description: Launch the AI Familiar Electron App Deterministically
---
1. Kill any existing Electron or Node processes to ensure a clean start.
// turbo
2. Get-Process -Name "electron", "node" | Stop-Process -Force -ErrorAction SilentlyContinue

3. Clean the Vite cache.
// turbo
4. Remove-Item -Recurse -Force node_modules\.vite -ErrorAction SilentlyContinue

5. Start the Development Server and Electron App.
// turbo
6. Start-Process -FilePath "npm" -ArgumentList "run dev -- --force" -NoNewWindow
7. Start-Process -FilePath "npx" -ArgumentList "electron ." -NoNewWindow
