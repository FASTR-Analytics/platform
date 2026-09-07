Your ops hand-off, same window as the image deploy, per instance:

mv <host>/sandbox <host>/runs.
Compose env SANDBOX_DIR_PATH* becomes RUNS_DIR_PATH*, value /app/runs.
Both the app container and the Postgres container mount the host dir at /app/runs. The Postgres container must be recreated, not just restarted.
The four sandbox sites in FASTR-Analytics/server-cli.
Delete every dir under runs/ whose name is a projects.id. A package dir always has manifest.json, a legacy dir never does.