# File Utils Module

A collection of file system utilities that add value beyond Deno's built-in
APIs, focusing on security, convenience, and cross-platform compatibility.

## Philosophy

This module follows the principle of using Deno's built-in APIs directly
whenever possible. It only provides utilities that add genuine value:

- Security validations
- Cross-platform compatibility
- Complex operations not provided by Deno
- Convenience functions that combine multiple operations

## Features

- ✅ **Path validation** - Security-focused path validation with traversal
  protection
- ✅ **Branded types** - Type-safe absolute file paths
- ✅ **Directory size calculation** - Recursive directory size calculation
- ✅ **MIME type detection** - Comprehensive MIME type detection from file
  extensions
- ✅ **Cross-platform utilities** - Platform-aware file operations
- ✅ **System information** - Home directory, temp directory detection

## Basic Usage

```typescript
import {
  calculateDirSize,
  getHomeDir,
  getMimeType,
  toAbsolutePath,
  validateFilePath,
} from "./_30_file_utils/mod.ts";

// Validate and convert paths
validateFilePath("/path/to/file.txt"); // Throws if path contains ".." or null bytes
const absPath = toAbsolutePath("relative/path.txt"); // Converts to absolute path

// Calculate directory size
const sizeInBytes = await calculateDirSize("/path/to/directory");
console.log(`Directory size: ${sizeInBytes} bytes`);

// Detect MIME types
const mimeType = getMimeType("document.pdf"); // "application/pdf"

// Get system directories
const homeDir = getHomeDir(); // "/Users/username" or "C:\Users\username"
```

## API Reference

### Path Utilities

#### `validateFilePath(filePath: string): void`

Validates a file path for security and correctness.

- Throws if path is empty
- Throws if path contains null bytes
- Throws if path contains ".." (directory traversal)

#### `toAbsolutePath(filePath: string): AbsoluteFilePath`

Converts a path to an absolute path with validation.

- Returns a branded type for type safety
- Works on all platforms

### File System Utilities

#### `calculateDirSize(path: string): Promise<number>`

Calculates the total size of a directory recursively.

- Returns size in bytes
- Ignores files/directories it can't read

#### `calculateDirSizeSync(path: string): number`

Synchronous version of calculateDirSize.

#### `validateFileSize(size: number, maxSizeBytes: number): void`

Validates that a file size is within acceptable limits.

- Throws with descriptive error if size exceeds limit

#### `setPermissions(path: string, mode: number): Promise<void>`

Sets file/directory permissions (Unix-like systems only).

- No-op on Windows
- Uses standard Unix permission modes (e.g., 0o755)

#### `setPermissionsSync(path: string, mode: number): void`

Synchronous version of setPermissions.

### MIME Type Utilities

#### `getMimeType(filePath: string): string`

Detects MIME type from file extension.

- Returns "application/octet-stream" for unknown types
- Supports common file types (images, documents, archives, etc.)

#### `getExtension(filePath: string): string`

Extracts the file extension in lowercase without the dot.

- Returns empty string if no extension

### Directory Utilities

#### `getParentDirectory(filePath: string): string`

Gets the parent directory of a file path.

- Handles both forward and backward slashes
- Properly handles Windows drive letters
- Returns "." for root-level paths

### System Utilities

#### `getSystemTempDir(): string`

Gets the system's default temp directory.

- Checks multiple environment variables (TMPDIR, TMP, TEMP, TEMPDIR)
- Falls back to OS-specific defaults (/tmp or C:\Temp)

#### `getHomeDir(): string`

Gets the user's home directory.

- Checks HOME and USERPROFILE environment variables
- Throws descriptive error if not found

## Type Safety

The module exports branded types for enhanced type safety:

```typescript
type AbsoluteFilePath = string & { readonly __brand: "AbsoluteFilePath" };
```

This prevents accidentally passing relative paths where absolute paths are
expected.

## Examples

### Secure File Operations

```typescript
import { getParentDirectory, validateFilePath } from "./_30_file_utils/mod.ts";

function saveFile(userProvidedPath: string, content: string) {
  // Validate the path first
  validateFilePath(userProvidedPath);

  // Ensure parent directory exists
  const parentDir = getParentDirectory(userProvidedPath);
  Deno.mkdirSync(parentDir, { recursive: true });

  // Write the file
  Deno.writeTextFileSync(userProvidedPath, content);
}
```

### Directory Size Monitoring

```typescript
import { calculateDirSize } from "./_30_file_utils/mod.ts";

async function monitorDirectorySize(path: string, maxSize: number) {
  const size = await calculateDirSize(path);

  if (size > maxSize) {
    console.warn(`Directory ${path} exceeds size limit: ${size} > ${maxSize}`);
  }

  return size;
}
```

## Best Practices

1. **Use Deno APIs directly** when they suffice - this module complements, not
   replaces, Deno's APIs
2. **Always validate user input** paths with `validateFilePath`
3. **Use branded types** for function parameters expecting absolute paths
4. **Handle cross-platform differences** using the provided utilities
5. **Check file existence** with `Deno.stat()` directly - we don't wrap this
