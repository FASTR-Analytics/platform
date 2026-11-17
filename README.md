# platform

The FASTR Analytics Platform for processing, visualizing, and analyzing health data. Built with Deno, SolidJS, TypeScript, and PostgreSQL with a modular architecture for executing R-based data processing pipelines.

## Setup

```bash
# Clone the repository
git clone https://github.com/FASTR-Analytics/platform.git
cd platform

# Sync the Panther library (required)
# This project uses the Panther visualization library which is synced separately.
# If you have access to panther source repository:
cd /path/to/panther
./sync platform
cd -

# Create instance directory structure (git-ignored)
mkdir -p _example_instance_dir/databases
mkdir -p _example_instance_dir/runs
mkdir -p _example_instance_dir/assets

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration:
#   - Clerk keys (CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY)
#   - Database credentials (PG_PASSWORD)
#   - Instance settings (INSTANCE_NAME, etc.)
#   - Paths reference _example_instance_dir (already configured)

# Setup client environment variables
cd client
cp .env.example .env.development.local
cp .env.example .env.production.local
# Edit both files with your Clerk configuration
cd ..

# Install client dependencies
cd client
npm install
cd ..
```

The `_example_instance_dir/` directory contains:

- `databases/` - PostgreSQL data files
- `runs/` - Results packages
- `assets/` - Uploaded assets and data files

These directories are git-ignored and referenced in `.env` via relative paths.

## Development

**Option 1: Single command** (runs both server and client):

```bash
./run
```

Output is prefixed with `S:` (green) for server and `C:` (blue) for client.

**Option 2: Separate terminals**:

```bash
# Terminal 1: Start the server (Deno)
deno task dev

# Terminal 2: Start the client (Vite)
cd client && npm run dev
```

The server runs on `http://localhost:8000` and the client on `http://localhost:3000`.

Four local auth modes are available: `BYPASS_AUTH` (a synthetic admin, the `.env` default), the persona switch (`PERSONA_AUTH` with `VITE_PERSONA_AUTH`), which signs the browser in as any `users` row through `?persona=<email>`, a personal access token, and OAuth. `PROTOCOL_APP_DEVELOPMENT.md` says when to use each.

## Type Checking

```bash
# Check server
deno check main.ts

# Check client
cd client && npm run typecheck
```

## Deployment

The `./deploy` script handles the complete deployment workflow:

```bash
./deploy
```

The script performs the following steps:

1. **Version Management**
   - Reads current version from `VERSION` file
   - Prompts to bump version (major/minor/patch)
   - Updates `VERSION` file with new version

2. **Client Build** (optional)
   - Optionally builds the client (`npm run build` in client/)
   - Output goes to `./client_dist/` which the server serves in production

3. **Typecheck Gate**
   - Runs `deno task typecheck` (server + client + `lint:systems` + `lint:structure` + `lint:text-sizes` + `lint:sql-json` + `lint:plan-citations`)

4. **Docker Image**
   - Builds Docker image tagged with version: `timroberton/comb:wb-fastr-server-v{version}`
   - Pushes image to Docker registry

5. **Git Commit**
   - Commits version bump and builds
   - Pushes to remote repository

**Note**: Building is only done as part of deployment. In development, the client uses Vite's dev server and the server runs directly with Deno.

## Project Structure

```plaintext
platform/
├── _example_instance_dir/  Instance data (git-ignored)
│   ├── assets/              Uploaded assets and data files
│   ├── databases/           PostgreSQL data files
│   └── runs/                Results packages
├── client/                  Client SPA (npm/Vite/SolidJS)
├── client_dist/             Client build output (served by server)
├── server/                  Server source (Deno/Hono)
├── lib/                     Shared library (types, translations, etc.)
├── panther/                 External UI/visualization library
├── report-forge/            The report editor package (synced copy, do not edit)
├── module_defs/             Module definition source files
├── module_defs_dist/        Generated module definitions
├── main.ts                  Server entry point
└── deno.json                Root configuration
```

## Technologies

- **Server**: Deno, Hono, PostgreSQL
- **Client**: SolidJS, Vite, TailwindCSS
- **Shared**: TypeScript (strict mode)

## License

The FASTR Analytics Platform is open-source software owned by the World Bank and the Global Financing Facility for Women, Children and Adolescents (GFF). "Open source" means that the software's source code (the written instructions that make up the software) is published for anyone to read and use.

The platform is released under the MIT License, one of the most widely used open-source licenses. Under the MIT License, anyone may use, copy, change, and share the platform's code for any purpose, without paying the owners and without asking their permission, provided every copy includes the copyright notice and the license text. See [LICENSE](LICENSE) for the full terms.

The MIT License covers software code only. It gives no one any right to the health data that a country holds in the platform, and each country owns its own data.

## Code and Fonts by Other Authors

This repository includes code and fonts made by other people. Each item listed below is used under its own open-source license, which also allows use without a fee and without asking permission.

- **Panther** (`panther/`): the library that draws the platform's charts and screens. A library is ready-made code that developers reuse. Panther is owned by Tim Roberton and released under the MIT License. See [panther/LICENSE.txt](panther/LICENSE.txt) and [panther/THIRD_PARTY_LICENSES.md](panther/THIRD_PARTY_LICENSES.md).
- **postgres.js** (`vendor/postgres/`): the code that connects the platform to its database. Its authors placed it in the public domain under the Unlicense. See [vendor/postgres/UNLICENSE](vendor/postgres/UNLICENSE).
- **Fonts** (`client/public/fonts/`): Fira Sans, International Inter (a version of Inter), Merriweather and Poppins are released under the SIL Open Font License 1.1. Roboto Condensed and Roboto Mono are released under the Apache License 2.0.

The platform also uses other open-source libraries, listed in `client/package.json`, `deno.json` and `panther/deno.json`. Each library is used under its own open-source license.
