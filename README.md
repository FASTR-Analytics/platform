# wb-fastr

The FASTR Analytics Platform for processing, visualizing, and analyzing health data. Built with Deno, SolidJS, TypeScript, and PostgreSQL with a modular architecture for executing R-based data processing pipelines.

## Setup

```bash
# Clone the repository
git clone https://github.com/FASTR-Analytics/platform.git
cd platform

# Sync the Panther library (required)
# This project uses the Panther visualization library which is synced separately.
# If you have access to timroberton-panther source repository:
cd /path/to/timroberton-panther
./sync wb-fastr
cd -

# Create instance directory structure (git-ignored)
mkdir -p _example_instance_dir/databases
mkdir -p _example_instance_dir/sandbox
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
- `sandbox/` - Temporary files for module execution
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

3. **Server Build**
   - Generates module definitions (`deno task build:modules`)
   - Builds translation files (`deno task build:translations`)

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
│   └── sandbox/             Temporary files for module execution
├── client/                  Client SPA (npm/Vite/SolidJS)
├── client_dist/             Client build output (served by server)
├── server/                  Server source (Deno/Hono)
├── lib/                     Shared library (types, translations, etc.)
├── panther/                 External UI/visualization library
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

Copyright (c) 2025 The World Bank, Global Financing Facility for Women, Children and Adolescents (GFF), Frequent Assessments and System Tools for Resilience (FASTR) Initiative. All rights reserved.

This software is proprietary and made publicly available for transparency and reference purposes only. Viewing and reviewing the source code is permitted. See [LICENSE](LICENSE) for full terms.

## Third-Party Code

This project depends on the Panther visualization library (`@timroberton/panther`), which is maintained separately and synced into the `panther/` directory (git-ignored). The library has its own licensing - see `panther/LICENSE.txt` and `panther/THIRD_PARTY_LICENSES.md` after syncing.
