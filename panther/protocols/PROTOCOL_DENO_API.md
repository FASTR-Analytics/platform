# Protocol: API Design

**Scope:** Deno

## Rules

1. **Validate at boundaries** — Validate external input, trust internal code
2. **Consistent response shapes** — `{ success: true, data }` or `{ success: false, err }`
3. **Early return on error** — Check permissions/validation first
4. **Descriptive error messages** — Include context for debugging
5. **Let errors propagate** — Don't catch and return error strings
6. **Zod for schema validation** — Derive from storage schemas where possible

## Response Shapes

### Success

```typescript
return { success: true, data: result };
return { success: true, data: { items, total } };
```

### Error

```typescript
return { success: false, err: "User not found" };
return { success: false, err: "Invalid date range" };
```

## Patterns

### Route Handler

```typescript
export async function handleGetItem(c: Context): Promise<Response> {
  const projectId = c.req.header("Project-Id");
  if (!projectId) {
    return c.json({ success: false, err: "Project-Id header required" });
  }

  const { id } = c.req.param();
  const item = await db.getItem(id);
  
  if (!item) {
    return c.json({ success: false, err: "Item not found" });
  }

  return c.json({ success: true, data: item });
}
```

### Input Validation

```typescript
const schema = z.object({
  name: z.string().min(1),
  value: z.number().positive(),
});

export async function handleCreate(c: Context): Promise<Response> {
  const body = await c.req.json();
  const parsed = schema.safeParse(body);
  
  if (!parsed.success) {
    return c.json({ success: false, err: parsed.error.message });
  }

  const result = await db.create(parsed.data);
  return c.json({ success: true, data: result });
}
```

### Permission Check

```typescript
export async function handleDelete(c: Context): Promise<Response> {
  const user = c.get("user");
  if (user.role !== "admin") {
    return c.json({ success: false, err: "Admin access required" });
  }

  const { id } = c.req.param();
  await db.delete(id);
  return c.json({ success: true, data: { deleted: id } });
}
```

## Schema Design (for AI tools)

### Derive from Storage Schemas

```typescript
// ✅ DO — derive from source of truth
const toolSchema = storageSchema.shape.config
  .partial()
  .describe("Configuration options");

// ❌ DON'T — create "slightly different" schemas
const toolSchema = z.object({
  col: z.string(),  // renamed from "column"
  vals: z.array(),  // renamed from "values"
});
```

### Two-Layer Validation

- **Layer 1 (Zod):** Types and structure
- **Layer 2 (Runtime):** Data-dependent validation

```typescript
// Layer 1 — schema validation
const schema = z.object({
  indicatorId: z.string(),
  dateRange: z.object({ start: z.string(), end: z.string() }),
});

// Layer 2 — runtime validation
async function validate(data: SchemaType): Promise<ValidationResult> {
  const indicator = await db.getIndicator(data.indicatorId);
  if (!indicator) {
    return { valid: false, err: "Indicator not found" };
  }
  return { valid: true };
}
```

## Do / Don't

### Error Handling

```typescript
// ❌ DON'T — catch and return string
try {
  await riskyOperation();
} catch (e) {
  return { success: false, err: "Something went wrong" };
}

// ✅ DO — let errors propagate with context
await riskyOperation().catch((e) => {
  throw new Error(`Operation failed for ${id}: ${e.message}`);
});
```

### Validation Location

```typescript
// ❌ DON'T — validate deep in business logic
function processData(data: unknown) {
  if (!data.id) throw new Error("Missing id");
  // ...
}

// ✅ DO — validate at route handler boundary
export async function handleProcess(c: Context) {
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ success: false, err: parsed.error.message });
  }
  // Business logic trusts validated data
  const result = processData(parsed.data);
  return c.json({ success: true, data: result });
}
```

## Checklist

- [ ] All routes return `{ success, data/err }` shape
- [ ] Input validated at route handler boundary
- [ ] Permission checks before business logic
- [ ] Error messages include context
- [ ] Schemas derived from storage schemas where possible
