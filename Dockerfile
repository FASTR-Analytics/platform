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

# Headless Chrome for the paged report PDF (server/report_pdf/). Chrome for
# Testing's headless shell, pinned: Ubuntu's apt "chromium" is a snap stub that
# does not run in a container. The libraries are the shell's runtime deps.
ENV CHROME_HEADLESS_SHELL_VERSION=152.0.7977.82
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl unzip ca-certificates \
      libnss3 libnspr4 libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
      libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libpango-1.0-0 libcairo2 libxshmfence1 fonts-liberation && \
    curl -fsSL -o /tmp/chrome.zip \
      "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_HEADLESS_SHELL_VERSION}/linux64/chrome-headless-shell-linux64.zip" && \
    unzip -q /tmp/chrome.zip -d /opt && \
    mv /opt/chrome-headless-shell-linux64 /opt/chrome-headless-shell && \
    rm /tmp/chrome.zip && \
    /opt/chrome-headless-shell/chrome-headless-shell --version && \
    rm -rf /var/lib/apt/lists/*
ENV CHROME_PATH=/opt/chrome-headless-shell/chrome-headless-shell

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
RUN mkdir /app/runs

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
ENV RUNS_DIR_PATH=/app/runs
ENV RUNS_DIR_PATH_POSTGRES_INTERNAL=/app/runs
ENV ASSETS_DIR_PATH=/app/assets

# Instance-specific variables passed at runtime (NOT hardcoded here):
# - PORT
# - CLIENT_ORIGIN
# - RUNS_DIR_PATH_EXTERNAL (host machine path for volume mount; also what
#   the R container mount uses for a package's tmp dir)
# - CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
# - INSTANCE_NAME, INSTANCE_LANGUAGE, INSTANCE_CALENDAR, INSTANCE_FISCAL_YEAR
# - ISO_COUNTRY_CODE (required — boot fails without it)
# - PG_HOST, PG_PORT, PG_PASSWORD
# - ANTHROPIC_API_URL, ANTHROPIC_API_KEY
# - SERVER_VERSION, DATABASE_FOLDER

CMD ["run", "-A", "--unstable-broadcast-channel", "--unstable-raw-imports", "main.ts"]

