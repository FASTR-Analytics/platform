# R module-execution container

Build context for the R image that executes module R scripts.

When a module runs, `server/worker_routines/run_module/run_module_iterator.ts`
spawns `Rscript` inside this image (prod) or runs `Rscript` on the host (dev).
See [SYSTEM_08_module_system.md](../SYSTEM_08_module_system.md).

## Images

| Tag                                | When | How built                        |
| ---------------------------------- | ---- | -------------------------------- |
| `timroberton/comb:wb-hmis-r-linux` | prod | `--platform linux/amd64`, pushed |
| `timroberton/comb:wb-hmis-r-local` | dev  | host arch, local only            |

Both are built from the same `Dockerfile` — only the platform/tag differ. The
image selected at runtime is `_DOCKER_IMAGE_TIDYVERSE_4_0_2` in
[run_module_iterator.ts](../server/worker_routines/run_module/run_module_iterator.ts)
(`_IS_PRODUCTION ? …-r-linux : …-r-local`).

> Note: that variable name says `4_0_2`, but the base image is
> `rocker/tidyverse:4.4.2`. The name is stale; the Dockerfile is authoritative.

## Building

```sh
./build         # build both (local + linux), push linux
./build local   # dev image only
./build linux   # prod image only, then push
```

Rebuild and push (`./build linux`) whenever the base image or installed R
packages change. The prod server pulls `wb-hmis-r-linux`; the dev host uses
`wb-hmis-r-local` if you run modules through Docker locally.

## Installed R packages

On top of `rocker/tidyverse`: `scales`, `lubridate`, `zoo`, `haven`,
`data.table`, `fixest`, `readxl`, `MASS`.
