# SilentCall

A [Vencord](https://vencord.dev) userplugin that lets you join DM and Group DM calls **without ringing** anyone. Toggle it on/off anytime.

## How it works

When Discord starts a call it fires:
```
PUT  /api/v9/channels/{id}/call        ← creates the call (goes through fine)
POST /api/v9/channels/{id}/call/ring   ← THIS rings people — we block it
```
SilentCall patches `XMLHttpRequest` to silently drop the ring POST while the toggle is on. Confirmed working via DevTools XHR spy.

## Features

- **Chat bar phone icon** — green = silent ON, grey/crossed = OFF
- **Right-click DM or Group DM** → checkbox **Silent Call**
- **`/silentcall`** slash command to toggle with chat confirmation
- State is **persistent** across restarts (stored in Vencord settings)
- XHR patch is always installed but only activates when toggle is ON — normal calls unaffected while OFF

## Installation

1. Have a [Vencord dev build](https://docs.vencord.dev/installing/)
2. Put the `silentCall` folder in `Vencord/src/userplugins/`:
```
Vencord/src/userplugins/silentCall/index.tsx
```
3. `pnpm build` then restart Discord
4. Enable **SilentCall** in Settings → Vencord → Plugins

## Usage

| Where | What |
|---|---|
| Chat bar | Phone icon — click to toggle |
| Right-click any DM or Group DM | Check/uncheck **Silent Call** |
| `/silentcall` | Toggles and confirms in chat |

## Settings

| Setting | Default | Description |
|---|---|---|
| Is Enabled | Off | Current toggle state |
| Show Icon | On | Show/hide chat bar button (requires restart) |

## License

GPL-3.0-or-later
