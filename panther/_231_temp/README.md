# Temp Module

A comprehensive temporary file and directory management system for Deno with
advanced features.

## Features

- ✅ **Configurable temp directory** - Use system temp or custom location
- ✅ **Async and sync APIs** - Full support for both patterns
- ✅ **Automatic cleanup** - TTL-based and process exit cleanup
- ✅ **Resource tracking** - Monitor temp usage and enforce size limits
- ✅ **File encryption** - Optional simple encryption for sensitive data
- ✅ **Type safety** - Branded types for temp paths
- ✅ **Error handling** - Comprehensive error types and retry logic
- ✅ **Platform support** - Works on Windows, macOS, and Linux
- ✅ **Testing utilities** - Mock manager for unit tests
- ✅ **Legacy compatibility** - Maintains backward compatibility

## Basic Usage

```typescript
import { defaultTempManager } from "./_31_temp/mod.ts";

// Create a temp directory
const tempDir = await defaultTempManager.createTempDir();
console.log(`Created: ${tempDir}`);

// Create a temp file
const tempFile = await defaultTempManager.createTempFile({
  prefix: "data",
  extension: "json",
});

// Write data to temp file
await defaultTempManager.writeTempFile(
  JSON.stringify({ hello: "world" }),
  { extension: "json" },
);

// Clean up when done
await defaultTempManager.cleanupAll();
```

## Advanced Usage

### Custom Configuration

```typescript
import { TempManager } from "./_31_temp/mod.ts";

const tempManager = new TempManager({
  baseDir: "./my-temp", // Custom directory (default: module's __TEMP directory)
  debug: true, // Enable logging
  autoCleanup: true, // Cleanup on exit
  maxTotalSize: 100 * 1024 * 1024, // 100MB limit
  defaultTtl: 3600000, // 1 hour TTL
});
```

### Encryption

```typescript
const secureManager = new TempManager({
  encryptionKey: new TextEncoder().encode("my-secret-key"),
});

// Data is automatically encrypted/decrypted
const file = await secureManager.writeTempFile("sensitive data");
const data = await secureManager.readTempFileText(file);
```

### TTL and Keep

```typescript
// Auto-delete after 5 seconds
const tempFile = await tempManager.createTempFile({
  ttl: 5000,
});

// Prevent auto-cleanup
const keepFile = await tempManager.createTempFile({
  keep: true,
});
```

### Statistics

```typescript
const stats = await tempManager.getStats();
console.log(`Total items: ${stats.totalItems}`);
console.log(`Total size: ${stats.totalSize} bytes`);
console.log(`Directories: ${stats.directories}`);
console.log(`Files: ${stats.files}`);
```

### Testing

```typescript
// Create a mock manager for tests
const mockManager = TempManager.createMock();
const testDir = await mockManager.createTempDir();
// ... run tests ...
await mockManager.cleanupAll();
```

## API Reference

### TempManager

Main class for managing temporary files and directories.

#### Constructor Options

- `baseDir?: string` - Base directory for temp files
- `debug?: boolean` - Enable debug logging
- `autoCleanup?: boolean` - Auto-cleanup on process exit
- `maxTotalSize?: number` - Maximum total size in bytes
- `defaultTtl?: number` - Default TTL in milliseconds
- `encryptionKey?: Uint8Array` - Encryption key

#### Methods

- `createTempDir(options?)` - Create a temp directory
- `createTempFile(options?)` - Create a temp file
- `writeTempFile(data, options?)` - Write data to a new temp file
- `readTempFile(path)` - Read binary data from temp file
- `readTempFileText(path)` - Read text from temp file
- `cleanup(path)` - Clean up specific item
- `cleanupAll()` - Clean up all items
- `getStats()` - Get usage statistics
- `keep(path)` - Mark item to keep
- `unkeep(path)` - Unmark item to keep

### Options

#### TempDirOptions / TempFileOptions

- `prefix?: string` - Prefix for the name
- `suffix?: string` - Suffix for the name
- `extension?: string` - File extension (files only)
- `keep?: boolean` - Keep from auto-cleanup
- `ttl?: number` - Time-to-live in ms
- `mode?: number` - Unix permissions

### Error Types

- `TempError` - Base error class
- `TempCreationError` - Failed to create temp item
- `TempCleanupError` - Failed to cleanup
- `TempSizeLimitError` - Size limit exceeded
- `TempPermissionError` - Permission error

## Migration from Legacy API

```typescript
// Old
import { clearTempDir, getTempDir } from "./_31_temp/mod.ts";
const dir = getTempDir();
clearTempDir();

// New
import { defaultTempManager } from "./_31_temp/mod.ts";
const dir = await defaultTempManager.createTempDir();
await defaultTempManager.cleanupAll();
```

## Best Practices

1. **Always cleanup** - Use `cleanupAll()` or enable `autoCleanup`
2. **Use TTL** - Set reasonable TTLs for automatic cleanup
3. **Monitor size** - Check stats regularly for long-running processes
4. **Handle errors** - Wrap operations in try-catch blocks
5. **Use types** - Leverage the branded types for type safety
