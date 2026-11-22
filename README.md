# Pumpworks

An original desktop browser tactical shooter. See [gameplay specification](docs/references/gameplay-spec.md) for the first match milestone.

## Local setup

Install Node.js 22.12 or later and pnpm 10.28.2. Install Blender 4.x and make sure `blender` is on your PATH. From the repository root:

```sh
pnpm install
blender --background --factory-startup --python-exit-code 1 --python assets/source/export_samples.py
pnpm --filter @pumpworks/shared build
pnpm dev
```

Open http://localhost:5173. The client displays a Babylon.js preview and checks the Colyseus server through Vite's development proxy. The server listens on http://127.0.0.1:2567 by default. Set `HOST` and `PORT` in the server environment, and set `PUMPWORKS_SERVER_URL` in `apps/client/.env.local` if you change the server address.

Run `pnpm lint`, `pnpm build`, and `pnpm typecheck` to verify changes. Click the test arena to capture the mouse. Use WASD to move, Shift to run, Ctrl to crouch, Space to jump, and Esc to release the mouse. Try the stairs, the ramp, and the low beam. Run `pnpm test:movement` after a build to exercise the shared controller. Open two browser windows and click **Join match** in each to test the same two-player prototype room. Matchmaking uses port 2567 by default. If the server uses a different address, set `VITE_PUMPWORKS_MATCH_URL` in `apps/client/.env.local` before starting the client. The red reset pad demonstrates server-synchronized knockouts and respawns. Combat is a later milestone.

For the browser smoke test, run `pnpm exec playwright install chromium` once, then run `pnpm build` and `pnpm test:browser`. The test starts both services. On Linux, use `pnpm exec playwright install --with-deps chromium` if browser system libraries are missing.

See the [asset pipeline](docs/references/asset-pipeline.md) for units, axes, and asset requirements.

Create a private party to share an invite code. Both players must mark Ready before the host can start. The host can instead fill the guest slot with a stationary training bot. Duplicate-agent selection is saved in the lobby for the agent-selection milestone. Invite codes expire after 30 minutes and new guests cannot join once the match starts.
