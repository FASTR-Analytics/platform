# _001_color

Comprehensive color system with RGB, HSL, and LCH support, color manipulation,
and palette management.

## Purpose

Provides a complete color system for data visualization including:

- Color class with multiple color space support (RGB, HSL, LCH)
- Color adjustment strategies (lightening, darkening, saturation)
- Pre-defined color palettes and sets
- Key color management system

## Key Exports

### Color Class (`color_class.ts`)

```typescript
class Color {
  // Create from various formats
  static fromRgb(r: number, g: number, b: number, a?: number): Color;
  static fromHex(hex: string): Color;
  static fromHsl(h: number, s: number, l: number, a?: number): Color;

  // Convert to different formats
  toRgb(): { r: number; g: number; b: number; a: number };
  toHex(): string;
  toHsl(): { h: number; s: number; l: number; a: number };
  toLch(): { l: number; c: number; h: number; a: number };

  // Color manipulation
  lighten(amount: number): Color;
  darken(amount: number): Color;
  saturate(amount: number): Color;
  desaturate(amount: number): Color;
  withAlpha(alpha: number): Color;
}
```

### Color Adjustment (`adjusted_color.ts`)

```typescript
type ColorAdjustmentStrategy =
  | "lighten"
  | "darken"
  | "saturate"
  | "desaturate"
  | "none";

getAdjustedColor(
  color: Color,
  strategy: ColorAdjustmentStrategy,
  amount: number
): Color
```

### Key Colors System (`key_colors.ts`)

Manage a global palette of named colors:

```typescript
setKeyColors(colors: KeyColors): void
getColor(key: string): Color
getColorAsRgb(key: string): string
generateKeyColors(): KeyColors
```

### Pre-defined Colors (`tim_colors.ts`)

```typescript
TIM_COLORS: Record<string, Color>;
TIM_COLOR_SETS: Record<string, Color[]>;
```

## Usage Example

```typescript
import { Color, getColor, TIM_COLORS } from "@timroberton/panther";

// Create colors
const red = Color.fromRgb(255, 0, 0);
const blue = Color.fromHex("#0000FF");

// Manipulate colors
const lightBlue = blue.lighten(0.2);
const transparent = blue.withAlpha(0.5);

// Use pre-defined colors
const primary = TIM_COLORS.teal;

// Use key colors
const brandColor = getColor("primary");
```

## Module Dependencies

None - pure color manipulation with no external dependencies.
