# Font Files Module

A type-safe font file management system for mapping font IDs to file paths,
supporting both WOFF/WOFF2 and TTF formats with built-in validation utilities.

## Features

- ✅ **Dual format support** - Separate mappings for WOFF/WOFF2 and TTF fonts
- ✅ **Type-safe font IDs** - TypeScript literal types for all registered fonts
- ✅ **Flexible font directory** - Environment variable or automatic detection
- ✅ **Path validation** - Security-focused path validation
- ✅ **Integration ready** - Works seamlessly with Skia (WOFF) and jsPDF (TTF)

## Basic Usage

```typescript
import {
  getTtfFontAbsoluteFilePath,
  getWoffFontAbsoluteFilePath,
} from "./_31_font_files/mod.ts";

// Get WOFF font path for Skia Canvas
const woffPath = getWoffFontAbsoluteFilePath("Inter-400-normal");
// Returns: "/Users/username/fonts/inter/Inter-Regular.woff2"

// Get TTF font path for PDF generation
const ttfPath = getTtfFontAbsoluteFilePath("Inter-400-normal");
// Returns: "/Users/username/fonts/inter/Inter-Regular.ttf"

// Works with FontInfo objects too
import { type FontInfo } from "panther";

const fontInfo: FontInfo = {
  fontFamily: "Inter",
  weight: 400,
  italic: false,
};

const woffPath2 = getWoffFontAbsoluteFilePath(fontInfo);
const ttfPath2 = getTtfFontAbsoluteFilePath(fontInfo);
```

## Configuration

### Font Directory

The module looks for fonts in the following order:

1. **Environment variable**: `FONT_FILES`
2. **Preferred path**: `/Users/timroberton/projects/FONT_FILES` (if exists)
3. **Home directory**: `~/fonts`
4. **System fallback**: `/usr/share/fonts`

Set the font directory:

```bash
export FONT_FILES=/path/to/your/fonts
```

## Available Fonts

### WOFF/WOFF2 Fonts

The module includes mappings for web fonts used by Skia Canvas:

- **Inter** (100-900, normal/italic) - Modern UI font (.woff2)
- **Fira Sans** (200-900) - Mozilla's font family (.woff)
- **Roboto** (300-900, normal/italic) - Google's font (.woff)
- **National 2** (400-900, normal/italic) - Professional display font (.woff)
- **Gibson** (200-900) - Clean geometric font (.woff)
- **Cambria** (400-700, normal/italic) - Microsoft's serif font (.woff)
- **Source Serif 4** (400-700) - Adobe's serif font (.woff)
- **Merriweather** (300-900, normal/italic) - Reading-optimized serif (.woff)
- **Fira Mono** (400-700) - Mozilla's monospace font (.woff)
- And more...

### TTF Fonts

The module includes TTF mappings for PDF generation with jsPDF:

- **Gibson** (100-900, normal/italic) - Full weight range (.ttf)
- **Inter** (100-900, normal/italic) - Complete family (.ttf)
- **Noto Sans Ethiopic** (100-900) - Ethiopian script support (.ttf)
- **Poppins** (100-900, normal/italic) - Geometric sans (.ttf)
- **Roboto Mono** (100-700, normal/italic) - Monospace family (.ttf)
- **Sarabun** (100-800, normal/italic) - Thai-supporting font (.ttf)

## API Reference

### Functions

#### `getWoffFontAbsoluteFilePath(fontInfoOrId: FontInfo | FontIdWoff): string`

Returns the absolute file path for a WOFF/WOFF2 font.

- Accepts either a FontInfo object or a font ID string
- Validates the path for security
- Throws if font is not found in WOFF map

#### `getTtfFontAbsoluteFilePath(fontInfoOrId: FontInfo | FontIdTtf): string`

Returns the absolute file path for a TTF font.

- Accepts either a FontInfo object or a font ID string
- Validates the path for security
- Throws if font is not found in TTF map

### Types

#### `FontIdWoff`

Type-safe union of all available WOFF font IDs.

```typescript
type FontIdWoff = "Inter-400-normal" | "Inter-700-normal" | ... // all WOFF font IDs
```

#### `FontIdTtf`

Type-safe union of all available TTF font IDs.

```typescript
type FontIdTtf = "Gibson-400-normal" | "Inter-400-normal" | ... // all TTF font IDs
```

## Integration Examples

### With Skia Canvas

```typescript
import { registerFontWithSkiaIfNeeded } from "_32_skia_canvas/mod.ts";
import { type FontInfo } from "panther";

const fontInfo: FontInfo = {
  fontFamily: "Inter",
  weight: 700,
  italic: false,
};

// Skia module internally uses getWoffFontAbsoluteFilePath
await registerFontWithSkiaIfNeeded(fontInfo);
```

### With jsPDF

```typescript
import { registerFontWithJsPdfIfNeeded } from "_32_pdf/mod.ts";
import { type FontInfo, type jsPDF } from "_32_pdf/deps.ts";

const fontInfo: FontInfo = {
  fontFamily: "Inter",
  weight: 700,
  italic: false,
};

// PDF module internally uses getTtfFontAbsoluteFilePath
registerFontWithJsPdfIfNeeded(pdf, fontInfo);
```

## Font File Structure

Expected directory structure:

```text
fonts/
├── inter/
│   ├── Inter-Regular.woff2    # For Skia
│   ├── Inter-Regular.ttf      # For jsPDF
│   ├── Inter-Bold.woff2
│   ├── Inter-Bold.ttf
│   └── ...
├── gibson/
│   ├── Gibson-Regular.woff    # For Skia
│   ├── Gibson-Regular.ttf     # For jsPDF
│   └── ...
└── ...
```

## Architecture

The module is structured for clean separation of concerns:

- `font_map_data_woff.ts` - WOFF/WOFF2 font mappings
- `font_map_data_ttf.ts` - TTF font mappings
- `get_font_absolute_file_path.ts` - Core path resolution logic
- `mod.ts` - Public API exports

The implementation uses a shared base function to eliminate code duplication
while maintaining type safety for each font format.

## Best Practices

1. **Set FONT_FILES environment variable** for production deployments
2. **Ensure both formats exist** if using both Skia and jsPDF
3. **Use type-safe imports** rather than string literals
4. **Handle font loading errors** gracefully with fallbacks
5. **Keep font files organized** in subdirectories by family
