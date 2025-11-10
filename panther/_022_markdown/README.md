# Markdown to Pages Guide

This module converts Markdown documents into presentation pages using the
`markdownToPages` function. This guide explains how to structure your Markdown
for optimal page generation.

## Page Types

The system supports three page types:

1. **Cover Page** (`#`) - Title pages for presentations
2. **Section Page** (`##`) - Section dividers
3. **Freeform Page** (`###`) - Content pages with flexible layout

## Basic Syntax

### Creating Pages

Pages are created when the parser encounters:

- Heading markers (`#`, `##`, `###`)
- Horizontal rule (`---`)

Each of these markers starts a new page.

### Page Type Determination

The heading level determines the page type:

- `# Title` → Cover page
- `## Section Title` → Section page
- `### Page Title` → Freeform page
- `---` → Continues with current type (defaults to freeform)

## Page Structure

### Cover Pages (`#`)

Cover pages display the main title and can optionally include a subtitle and
date. The first two paragraphs after the `#` heading have special meaning:

- **First paragraph**: Becomes the subtitle
- **Second paragraph**: Becomes the date text
- **Additional content**: Ignored (not displayed)

```markdown
# My Presentation Title

This becomes the subtitle

December 2024

Any additional content is ignored on cover pages.
```

You can also have just a title, or title with subtitle only:

```markdown
# Just a Title

## Next Section
```

```markdown
# Title with Subtitle

This is my subtitle only

## Next Section
```

### Section Pages (`##`)

Section pages display only the section title. Content is ignored similar to
cover pages.

```markdown
## Introduction

This content will be ignored on section pages. Only the section title is
displayed.
```

### Freeform Pages (`###`)

Freeform pages support rich content:

- **Header**: The `###` heading becomes the page header
- **Content**: All other content including paragraphs, bullets, and lower-level
  headings

```markdown
### Page Title

This is a paragraph on the page.

- Bullet point 1
- Bullet point 2
  - Nested bullet (2 spaces)
    - Deeply nested (4 spaces)
```

## Content Formatting

### Paragraphs

Regular text becomes paragraphs. Separate paragraphs with blank lines.

```markdown
### My Page

This is the first paragraph.

This is the second paragraph.
```

### Bullet Lists

Use `-`, `*`, or numbered lists (`1.`, `2.`, etc.) for bullets. Indent with
spaces for nested bullets:

- No indent: Level 1 bullet
- 2+ spaces: Level 2 bullet
- 4+ spaces: Level 3 bullet

```markdown
### Bullet Examples

- Main point
  - Sub point (2 spaces)
    - Sub-sub point (4 spaces)
- Another main point

### Numbered List Example

1. First item
2. Second item
   1. Nested numbered item
3. Third item

### Mixed Bullets

- Dash bullet

* Star bullet

1. Numbered bullet
```

### Headings in Content

All lower-level headings within pages are converted to paragraphs:

- `####`, `#####`, and `######` all become regular paragraphs
- This allows for semantic structuring while maintaining simple page layouts

```markdown
### Main Title

#### This becomes a paragraph

##### This also becomes a paragraph

###### And this too becomes a paragraph
```

## Page Boundaries

### Explicit Boundaries

Use `---` to explicitly start a new page while maintaining the current page
type:

```markdown
### First Page

Content for first page.

---

### Second Page

Content for second page.
```

### Implicit Boundaries

Any heading (`#`, `##`, `###`) automatically starts a new page:

```markdown
### Page One

Content here.

### Page Two

This automatically starts a new page.
```

## Complete Example

```markdown
# Advanced Data Visualization

A comprehensive guide to data visualization

December 2024

## Introduction

### What We'll Cover

- Data preparation techniques
- Visualization best practices
- Interactive dashboards

### Why Visualization Matters

Good visualizations help:

- Identify patterns quickly
- Communicate insights clearly
- Drive decision making

#### Key Benefits

Organizations that use data visualization effectively see improved outcomes.

---

### Key Principles

1. Start with clean data
2. Choose appropriate chart types
3. Use color effectively

## Data Preparation

### Cleaning Your Data

Data preparation involves:

- Removing duplicates
- Handling missing values
- Standardizing formats

### Transform and Aggregate

Common transformations include:

- Grouping by categories
- Calculating moving averages
- Creating derived metrics

#### Advanced Techniques

For complex datasets, consider using window functions and pivoting.

## Best Practices

### Design Guidelines

Keep visualizations:

- Simple and focused
- Accessible to all users
- Consistent in style

---

### Thank You

Questions?
```

## Usage in Code

```typescript
import { markdownToPages } from "@timroberton/panther";

const markdown = `
# My Presentation

## Section One

### First Content Page
Content goes here.
`;

const pages = markdownToPages(markdown, {
  style: {/* optional custom styles */},
});
```

## Best Practices for Markdown Files

### Structure Your Presentation

1. **Start with a cover page** - Use `#` for your presentation title
2. **Use section dividers** - Break content into logical sections with `##`
3. **Keep pages focused** - One main idea per page
4. **Use consistent formatting** - Maintain the same style throughout

### Content Guidelines

1. **Concise headers** - Keep page titles short and descriptive
2. **Bullet points for lists** - Use bullets instead of long paragraphs
3. **Hierarchy with headings** - Use `####` and `#####` to create visual
   hierarchy within content (they render as emphasized paragraphs)
4. **White space** - Use blank lines to improve readability

### Common Patterns

```markdown
# Presentation Title

Subtitle or tagline

Event Date or Author

## Section Name

### Introduction to Topic

Brief overview paragraph.

Key points:

- First point
- Second point

### Detailed Explanation

#### Important Concept

This heading renders as a paragraph with emphasis.

Supporting details go here.

### Summary

- Key takeaway 1
- Key takeaway 2

## Next Section
```

## Important Notes

1. **Cover pages use first two paragraphs** - First paragraph becomes subtitle,
   second becomes date. Additional content is ignored.
2. **Section pages ignore all content** - Only the title is displayed
3. **Lower headings become paragraphs** - All `####`, `#####`, and `######`
   headings are converted to regular paragraphs in the content
4. **Blank pages are skipped** - Pages without headers or content are not
   created
5. **Indentation matters** - Use consistent spacing for bullet levels:
   - 0-1 spaces = Level 1
   - 2-3 spaces = Level 2
   - 4+ spaces = Level 3
6. **Line breaks** - Multiple lines of text are joined into paragraphs; use
   blank lines to separate paragraphs
