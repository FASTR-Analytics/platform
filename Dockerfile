FROM denoland/deno:ubuntu-2.5.3

RUN apt update && \
    yes | apt install software-properties-common && \
    add-apt-repository ppa:ubuntu-toolchain-r/test && \
    apt-get update && \
    yes | apt-get install --only-upgrade libstdc++6 && \
    yes | apt install docker.io && \
    mkdir /usr/share/fonts && \
    docker --version && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 8000

WORKDIR /app

COPY deno.json deno.json
COPY panther/deno.json panther/deno.json
COPY vendor vendor

RUN deno install --allow-import

COPY lib lib
COPY panther panther
COPY server server
COPY client_dist client_dist
COPY main.ts main.ts

RUN mkdir /app/databases
RUN mkdir /app/sandbox

# ==============================================================================
# Environment Variables
# ==============================================================================
# These are hardcoded production defaults.
# Instance-specific variables (Clerk keys, PG connection, etc.) are passed
# at container runtime via docker run -e or docker-compose environment.
# ==============================================================================

# Production mode indicator
ENV IS_PRODUCTION=true

# Directory paths inside container (constant across deployments)
ENV SANDBOX_DIR_PATH=/app/sandbox
ENV SANDBOX_DIR_PATH_POSTGRES_INTERNAL=/app/sandbox
ENV ASSETS_DIR_PATH=/app/assets
# NOTE: there is no RUNS_DIR_PATH. Results packages live in the sandbox
# directory (server/exposed_env_vars.ts), which is already mounted into BOTH
# this container and the Postgres container and already world-writable — so a
# package needs no new volume, compose change, chmod or env var. Once Phase 4
# removes the legacy per-project dirs, that directory and its vars get renamed
# to runs.

# Instance-specific variables passed at runtime (NOT hardcoded here):
# - PORT
# - CLIENT_ORIGIN
# - SANDBOX_DIR_PATH_EXTERNAL (host machine path for volume mount; also what
#   the R container mount uses for a package's tmp dir)
# - CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
# - INSTANCE_NAME, INSTANCE_LANGUAGE, INSTANCE_CALENDAR, INSTANCE_FISCAL_YEAR
# - ISO_COUNTRY_CODE (required — boot fails without it)
# - PG_HOST, PG_PORT, PG_PASSWORD
# - ANTHROPIC_API_URL, ANTHROPIC_API_KEY
# - SERVER_VERSION, DATABASE_FOLDER

CMD ["run", "-A", "--unstable-broadcast-channel", "--unstable-raw-imports", "main.ts"]

