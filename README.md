# Pumpworks

An original desktop browser tactical shooter. See [gameplay specification](docs/references/gameplay-spec.md) for the first match milestone.

## Local setup

Install Node.js 22.12 or later and pnpm 10.28.2. From the repository root:

```sh
pnpm install
pnpm --filter @pumpworks/shared build
pnpm dev
```

Open http://localhost:5173. The client displays a Babylon.js preview and checks the Colyseus server through Vite's development proxy. The server listens on http://127.0.0.1:2567 by default. Set `HOST` and `PORT` in the server environment, and set `PUMPWORKS_SERVER_URL` in `apps/client/.env.local` if you change the server address.

Run `pnpm lint`, `pnpm build`, and `pnpm typecheck` to verify changes. The workspace currently provides a preview, readiness endpoint, and placeholder room. Match play and room joining are later milestones.
