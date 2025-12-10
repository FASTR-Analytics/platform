// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, For, JSX, Match, Show, Switch } from "solid-js";
import type { CustomMarkdownStyleOptions, ImageMap } from "../deps.ts";
import { parseMarkdown } from "../../_105_markdown/mod.ts";
import type { DocElement, InlineContent } from "../../_105_markdown/mod.ts";
import {
  deriveMarkdownCssVars,
  MARKDOWN_BASE_STYLES,
} from "../utils/markdown_tailwind.ts";

export type MarkdownImageRenderer = (src: string, alt: string) => JSX.Element | undefined;

type Props = {
  markdown: string;
  style?: CustomMarkdownStyleOptions;
  scale?: number;
  images?: ImageMap;
  contentWidth?: string;
  renderImage?: MarkdownImageRenderer;
};

export function MarkdownPresentationJsx(p: Props) {
  const parsedDoc = createMemo(() => parseMarkdown(p.markdown));

  const allStyles = createMemo(() => {
    return {
      "font-size": `${p.scale ?? 1}em`,
      "--md-content-width": p.contentWidth ?? "100%",
      ...deriveMarkdownCssVars(p.style),
    };
  });

  return (
    <div class={MARKDOWN_BASE_STYLES} style={allStyles()}>
      <ElementsRenderer
        elements={parsedDoc().elements}
        images={p.images}
        renderImage={p.renderImage}
      />
    </div>
  );
}

type ElementsRendererProps = {
  elements: DocElement[];
  images?: ImageMap;
  renderImage?: MarkdownImageRenderer;
};

function ElementsRenderer(p: ElementsRendererProps) {
  const groupedElements = createMemo(() => {
    const groups: { type: "single" | "bullet" | "numbered"; elements: DocElement[] }[] = [];
    let currentList: { type: "bullet" | "numbered"; elements: DocElement[] } | null = null;

    for (const el of p.elements) {
      if (el.type === "list-item") {
        const listType = el.listType === "numbered" ? "numbered" : "bullet";
        if (currentList && currentList.type === listType) {
          currentList.elements.push(el);
        } else {
          if (currentList) groups.push(currentList);
          currentList = { type: listType, elements: [el] };
        }
      } else {
        if (currentList) {
          groups.push(currentList);
          currentList = null;
        }
        groups.push({ type: "single", elements: [el] });
      }
    }
    if (currentList) groups.push(currentList);

    return groups;
  });

  return (
    <For each={groupedElements()}>
      {(group) => (
        <Switch>
          <Match when={group.type === "bullet"}>
            <ul>
              <For each={group.elements}>
                {(el) => (
                  <li><InlineContentRenderer content={el.content} /></li>
                )}
              </For>
            </ul>
          </Match>
          <Match when={group.type === "numbered"}>
            <ol>
              <For each={group.elements}>
                {(el) => (
                  <li><InlineContentRenderer content={el.content} /></li>
                )}
              </For>
            </ol>
          </Match>
          <Match when={group.type === "single"}>
            <DocElementRenderer
              element={group.elements[0]}
              images={p.images}
              renderImage={p.renderImage}
            />
          </Match>
        </Switch>
      )}
    </For>
  );
}

type DocElementRendererProps = {
  element: DocElement;
  images?: ImageMap;
  renderImage?: MarkdownImageRenderer;
};

function DocElementRenderer(p: DocElementRendererProps) {
  return (
    <Switch>
      <Match when={p.element.type === "heading" && p.element.level === 1}>
        <h1><InlineContentRenderer content={p.element.content} /></h1>
      </Match>
      <Match when={p.element.type === "heading" && p.element.level === 2}>
        <h2><InlineContentRenderer content={p.element.content} /></h2>
      </Match>
      <Match when={p.element.type === "heading" && p.element.level === 3}>
        <h3><InlineContentRenderer content={p.element.content} /></h3>
      </Match>
      <Match when={p.element.type === "heading" && p.element.level === 4}>
        <h4><InlineContentRenderer content={p.element.content} /></h4>
      </Match>
      <Match when={p.element.type === "heading" && p.element.level === 5}>
        <h5><InlineContentRenderer content={p.element.content} /></h5>
      </Match>
      <Match when={p.element.type === "heading" && p.element.level === 6}>
        <h6><InlineContentRenderer content={p.element.content} /></h6>
      </Match>
      <Match when={p.element.type === "paragraph"}>
        <p><InlineContentRenderer content={p.element.content} /></p>
      </Match>
      <Match when={p.element.type === "image"}>
        <ImageElementRenderer
          src={p.element.imageData}
          alt={p.element.imageAlt}
          width={p.element.imageWidth}
          height={p.element.imageHeight}
          images={p.images}
          renderImage={p.renderImage}
        />
      </Match>
      <Match when={p.element.type === "horizontal-rule"}>
        <hr />
      </Match>
      <Match when={p.element.type === "blockquote"}>
        <blockquote><InlineContentRenderer content={p.element.content} /></blockquote>
      </Match>
      <Match when={p.element.type === "table"}>
        <TableElementRenderer element={p.element} />
      </Match>
      <Match when={p.element.type === "code-block"}>
        <pre><code>{p.element.codeContent}</code></pre>
      </Match>
      <Match when={p.element.type === "math-block"}>
        <div class="katex-display">
          <code>{p.element.mathLatex}</code>
        </div>
      </Match>
    </Switch>
  );
}

type ImageElementRendererProps = {
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  images?: ImageMap;
  renderImage?: MarkdownImageRenderer;
};

function ImageElementRenderer(p: ImageElementRendererProps) {
  if (!p.src) return null;

  // Try custom renderer first
  if (p.renderImage) {
    const customElement = p.renderImage(p.src, p.alt ?? "");
    if (customElement) {
      return customElement;
    }
  }

  // Try ImageMap
  if (p.images) {
    const imageInfo = p.images.get(p.src);
    if (imageInfo) {
      return (
        <img
          src={imageInfo.dataUrl}
          alt={p.alt}
          width={imageInfo.width}
          height={imageInfo.height}
        />
      );
    }
  }

  // Fallback to raw src
  return (
    <img
      src={p.src}
      alt={p.alt}
      width={p.width}
      height={p.height}
    />
  );
}

type TableElementRendererProps = {
  element: DocElement;
};

function TableElementRenderer(p: TableElementRendererProps) {
  return (
    <table>
      <Show when={p.element.tableHeader && p.element.tableHeader.length > 0}>
        <thead>
          <For each={p.element.tableHeader}>
            {(row) => (
              <tr>
                <For each={row}>
                  {(cell) => (
                    <th><InlineContentRenderer content={cell.flat()} /></th>
                  )}
                </For>
              </tr>
            )}
          </For>
        </thead>
      </Show>
      <Show when={p.element.tableRows && p.element.tableRows.length > 0}>
        <tbody>
          <For each={p.element.tableRows}>
            {(row) => (
              <tr>
                <For each={row}>
                  {(cell) => (
                    <td><InlineContentRenderer content={cell.flat()} /></td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </Show>
    </table>
  );
}

type InlineContentRendererProps = {
  content: InlineContent[];
};

function InlineContentRenderer(p: InlineContentRendererProps) {
  return (
    <For each={p.content}>
      {(item) => (
        <Switch fallback={item.text}>
          <Match when={item.type === "text"}>
            {item.text}
          </Match>
          <Match when={item.type === "bold"}>
            <strong>{item.text}</strong>
          </Match>
          <Match when={item.type === "italic"}>
            <em>{item.text}</em>
          </Match>
          <Match when={item.type === "link"}>
            <a href={item.url} target="_blank" rel="noopener noreferrer">{item.text}</a>
          </Match>
          <Match when={item.type === "email"}>
            <a href={`mailto:${item.url ?? item.text}`}>{item.text}</a>
          </Match>
          <Match when={item.type === "break"}>
            <br />
          </Match>
          <Match when={item.type === "code-inline"}>
            <code>{item.text}</code>
          </Match>
          <Match when={item.type === "math-inline"}>
            <code>{item.text}</code>
          </Match>
        </Switch>
      )}
    </For>
  );
}
