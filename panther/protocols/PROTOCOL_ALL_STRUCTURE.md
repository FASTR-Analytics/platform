# Protocol: Project Structure

**Scope:** All

## Rules

1. **Never modify panther/** — External library, auto-synced
2. **Barrel exports via mod.ts** — Not `index.ts`
3. **Underscore prefix for internal** — `_internal/`, `_helpers.ts`
4. **Domain types centralized** — In `data/types.ts` or `lib/types/`
5. **Static imports only** — Never dynamic imports
6. **Exports before helpers** — Main functions at top of file

## File Naming

| Type | Convention | Example |
| ---- | ---------- | ------- |
| General files | snake_case | `measure_text.ts` |
| Components | PascalCase | `DataTable.tsx` |
| Route pages | Underscore prefix | `_4_marking.tsx` |
| Internal modules | Underscore prefix | `_internal/` |

## Directory Patterns

### SolidJS App (UI mode)

```
src/
├── components/        # Feature-organized components
│   ├── dashboard/
│   └── settings/
├── data/
│   ├── types.ts       # All domain types
│   ├── collections/   # Data access layer
│   └── mod.ts         # Barrel export
├── pages/             # Route components (_N_name.tsx)
├── panther/           # DO NOT MODIFY
├── state/             # Global state (if needed)
└── utils/             # Business logic
```

For the opinionated rules *inside* `components/` (feature-mirrors-UI, the `_shared/` home, co-location, facet nesting), see `PROTOCOL_UI_STRUCTURE.md`.

### Full-Stack App (both mode)

```
project/
├── client/
│   └── src/           # Same as UI app above
├── server/
│   ├── routes/        # API route handlers
│   ├── db/            # Database access + migrations
│   └── middleware/    # Auth, CORS, etc.
├── lib/               # Shared types
│   └── types/
└── panther/           # DO NOT MODIFY
```

### Deno Scripts (deno mode)

```
project/
├── data/              # Input data files
├── outputs/           # Generated files
├── panther/           # DO NOT MODIFY
└── generate_*.ts      # Script files
```

## Import Order

Preferred order (not strictly enforced):

1. External libraries
2. Panther imports
3. SolidJS imports
4. App-internal imports (`~/...`)
5. Relative imports (`./...`)

```tsx
import { apiClient } from "lib";
import { Button, timQuery } from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { EditForm } from "./EditForm";
```

## Do / Don't

### Panther Directory

```bash
# ❌ DON'T
vim panther/_303_components/button.tsx  # editing panther

# ✅ DO
# Make changes in timroberton-panther repo, then sync
```

### Barrel Exports

```typescript
// ❌ DON'T
// index.ts
export * from "./types";

// ✅ DO
// mod.ts
export * from "./types.ts";
export type { MyType } from "./types.ts";
```

### Type Organization

```typescript
// ❌ DON'T — types scattered
// components/Card.tsx
export type CardProps = { ... };

// pages/Dashboard.tsx
export type DashboardData = { ... };

// ✅ DO — centralized
// data/types.ts
export type CardProps = { ... };
export type DashboardData = { ... };
```

## Checklist

- [ ] No modifications to `panther/` directory
- [ ] Barrel exports use `mod.ts`
- [ ] Internal modules prefixed with underscore
- [ ] Domain types in centralized location
- [ ] Import order follows convention
