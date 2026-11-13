# Running the stack locally

## Just show me the pages

```powershell
.\start.ps1
```

From the project root, or right-click the file and pick **Run with
PowerShell**. It starts Docker, Supabase and the dev server, seeds the demo
society if the database is empty, then opens the browser. Re-running it is
safe: it skips whatever is already up and never seeds twice.

Everything below is the same thing by hand.

Commands as typed in **PowerShell 5.1**. PowerShell 5.1 has no `&&`, so each
chain below uses `;` or an `if ($?)` guard — the `&&` one-liners in the root
`README.md` are Bash and will not work when pasted into a PowerShell prompt.

Every `cd` below is **relative to the repository root**, so run them from
there.

Two processes have to be up. Either one alone gives a broken app: without
Supabase the sign-in buttons do nothing, and without Vite there is nothing on
`localhost:5173`.

## 1. The Vite dev server (frontend)

```powershell
cd frontend
npm run dev
```

Serves <http://localhost:5173/>. First run in a fresh clone needs
`npm install` first.

That occupies the terminal. To leave it running in its own window and keep
the prompt:

```powershell
cd frontend
Start-Process cmd.exe -ArgumentList "/c npm run dev" -WindowStyle Minimized
```

Started this way it is **independent of the shell that launched it** — closing
the terminal, or ending an agent session, leaves it serving. Launched in the
foreground, or by a tool that owns the process, it dies with its parent.

### Other frontend commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR on :5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built `dist/` — use this to check production behaviour, since some things differ from dev |
| `npm run verify` | The full gate: typecheck, tests, CSP hash, asset and bundle-budget checks |
| `npm run typecheck` | Types only. **Use this, not a bare `tsc --noEmit`** — the root `tsconfig.json` has no `files`, only project references, so bare `tsc` compiles nothing and passes |

## 2. Supabase (backend)

Needs **Docker Desktop running first** — if the daemon is down, the CLI fails
with a connection error that looks like a Supabase problem.

```powershell
Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
```

Wait until `docker ps` answers without error, then:

```powershell
cd backend
npx supabase start
```

Prints the local URLs and keys. The ones that matter:

| Service | URL |
|---|---|
| API (Kong) | <http://127.0.0.1:54321> |
| Studio | <http://127.0.0.1:54323> |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Mailpit (sent mail) | <http://127.0.0.1:54324> |

Stop it with `npx supabase stop`.

## 3. Seeding the demo society

Only needed once per database, or after a reset. The seed is **Deno**, not
Node:

```powershell
cd backend
deno run -A scripts/seed.ts
```

Creates **Gulmohar Heights CHS** — roughly 4,250 chain entries, 96 flats, 11
committee seats and 14 logins.

## Signing in

The sign-in page carries a **quick-login button per role** under "Demo
society, local only": Resident, Tenant, Treasurer, Secretary, President,
Committee, Auditor. No email or OTP needed locally.

Typing credentials by hand works too — `<role>@gulmohar.test` with the demo
password from `backend/scripts/seed.ts` (`DEMO_PASSWORD`). Roles:
`president`, `secretary`, `treasurer`, `m1`…`m8`, `auditor`, `resident`,
`tenant`.

## Checking it is actually up

```powershell
curl.exe -s -o NUL -w "dev:%{http_code}`n" http://localhost:5173/
curl.exe -s -o NUL -w "api:%{http_code}`n" http://127.0.0.1:54321/rest/v1/
```

Both should print `200`. Use `curl.exe`, not `curl` — bare `curl` in
PowerShell 5.1 is an alias for `Invoke-WebRequest`, which takes different
arguments entirely.

To confirm the seed survived:

```powershell
$env:PGPASSWORD = 'postgres'
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tAc "select count(*) from chain_entries;"
```

## If something is wrong

- **`localhost:5173` refuses the connection** — the dev server is not running,
  or exited with its parent shell. Restart it with the `Start-Process` form.
- **App loads, sign-in does nothing** — Supabase is down. Check `docker ps`,
  then `npx supabase start`.
- **API answers `503` with "name resolution failed"** — the edge runtime
  container is stopped, which `supabase db reset` does. A `401` means
  reachable and unauthorised, which is healthy; a `503` means the container is
  down.
- **Page renders unstyled but fully populated** — blocked CSS, not missing
  CSS. The dev server uses a per-start CSP nonce. **Never "fix" this by
  adding `'unsafe-inline'`**; restart the dev server so the nonce is reissued.
- **Fresh clone, no `.env`** — each lane's own README covers the environment
  it needs. The frontend wants the Supabase URL and publishable key; the
  backend generates an edge-function secret locally.
