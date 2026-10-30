# Request: busy marker on the status site, restart gate in the server CLI

For Nick. Two changes outside this repo, both reading one new field on
`/health_check`.

## What changed in the server

`GET /health_check` (public, no auth, every instance) now returns

```json
"busy": {
  "generatingRuns": 1,
  "runningImports": ["hmis"]
}
```

- `generatingRuns`: the number of results packages being generated (`runs` rows
  with status `generating`).
- `runningImports`: the dataset families with an import in progress (`hmis`,
  `hfa`, `iceh`, in that order; empty when none). HMIS covers both the DHIS2
  pulls and the CSV wizard. A queued HMIS import is not counted: it survives a
  restart and starts afterwards.

An instance is busy when `generatingRuns > 0` or `runningImports` is not empty.
A restart kills that work: the server marks the package failed and the import
errored at the next boot, and the user has to start again.

The field replaces `hasRunningModules`, which is gone. An instance on an older
server version returns a payload with neither field. Treat a missing `busy` as
not busy in both consumers: the fleet runs mixed versions until every instance
is upgraded.

## 1. Status site (status.fastr-analytics.org)

Where the fleet view already fetches `/health_check` per instance:

- Mark a busy active server with a signifier after its name (an asterisk is
  fine) so it is visible at a glance that the instance must not be restarted.
- Give the marker a title or tooltip that says what is running, built from the
  field, for example `Generating 1 results package; importing hmis`.
- No marker when `busy` is missing or reports nothing.

## 2. Server CLI (`wb`, repo server-cli)

`wb restart` and `wb stop` both kill the work above. Gate both.

### Helper

One helper, for example `src/utils/instance-busy.ts`:

```ts
export type InstanceBusy = {
  generatingRuns: number;
  runningImports: string[];
};

// null = not busy, or the instance cannot be asked (down, timed out, or an
// older server version with no `busy` field). A server that cannot answer is
// often the reason for the restart, so it never blocks one.
export async function getInstanceBusy(
  port: number,
): Promise<InstanceBusy | null>;

export function describeBusy(busy: InstanceBusy): string;
// e.g. "generating 1 results package, importing hmis"
```

`getInstanceBusy` fetches `http://localhost:${port}/health_check` with a short
timeout (5 s, `AbortSignal.timeout`), parses the JSON, and returns `busy` only
when it reports work. The CLI runs on the host, so the instance's published port
is the address; `serverInfo.port` already holds it.

### Commands

In `src/commands/docker/restart.ts` and `src/commands/docker/stop.ts`, inside
the per-id loop, before the first `stopContainer` call:

```ts
const busy = await getInstanceBusy(serverInfo.port);
if (busy && !force) {
  console.error(
    colors.red(
      `Skipping ${serverInfo.id}: ${
        describeBusy(busy)
      }. Wait for it to finish, or pass --force to restart anyway.`,
    ),
  );
  skipped = true;
  continue;
}
```

- Busy targets are skipped; the other targets in the same call proceed. After
  the loop, exit 1 if anything was skipped, so a scripted deploy (the
  `deploy_testing` script in this repo runs `wb restart <id>` over ssh and
  treats a nonzero exit as a failed deploy) stops instead of silently leaving an
  instance on the old version.
- `--force` (alias `-f`) is already parsed in `src/core/cli.ts` as `args.force`
  but is not passed to these handlers. Pass it:
  `handleRestart(targets, args.interactive, args.force)` and
  `handleStop(targets, args.force)`.
- Add the flag to `src/utils/help.ts` next to `wb restart` and `wb stop`:
  `--force  restart or stop even while a results package is generating or an
  import is running`.

### Expected behaviour

```
$ wb restart ethiopia
Skipping ethiopia: generating 1 results package, importing hmis. Wait for it to finish, or pass --force to restart anyway.
$ echo $?
1
$ wb restart ethiopia --force
Stop container: ethiopia 8012
...
```

An instance that is down, or on a server version without the field, restarts as
before.
