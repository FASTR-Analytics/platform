// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, For, type JSX, Match, Show, Switch } from "solid-js";
import type { CustomMarkdownStyleOptions, ImageMap } from "../deps.ts";
import { parseMarkdown } from "../../_105_markdown/mod.ts";
import type {
  MarkdownInline,
  ParsedMarkdownItem,
} from "../../_105_markdown/mod.ts";
import {
  deriveMarkdownCssVars,
  MARKDOWN_BASE_STYLES,
} from "../utils/markdown_tailwind.ts";

export type MarkdownImageRenderer = (
  src: string,
  alt: string,
) => JSX.Element | undefined;

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
        elements={parsedDoc().items}
        images={p.images}
        renderImage={p.renderImage}
      />
    </div>
  );
}

type ElementsRendererProps = {
  elements: ParsedMarkdownItem[];
  images?: ImageMap;
  renderImage?: MarkdownImageRenderer;
};

function ElementsRenderer(p: ElementsRendererProps) {
  const groupedElements = createMemo(() => {
    const groups: {
      type: "single" | "bullet" | "numbered";
      elements: ParsedMarkdownItem[];
    }[] = [];
    let currentList: {
      type: "bullet" | "numbered";
      elements: ParsedMarkdownItem[];
    } | null = null;

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
                  <li>
                    <InlineContentRenderer
                      content={(el as ParsedMarkdownItem & {
                        type: "list-item";
                      })
                        .content}
                    />
                  </li>
                )}
              </For>
            </ul>
          </Match>
          <Match when={group.type === "numbered"}>
            <ol>
              <For each={group.elements}>
                {(el) => (
                  <li>
                    <InlineContentRenderer
                      content={(el as ParsedMarkdownItem & {
                        type: "list-item";
                      })
                        .content}
                    />
                  </li>
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
  element: ParsedMarkdownItem;
  images?: ImageMap;
  renderImage?: MarkdownImageRenderer;
};

function DocElementRenderer(p: DocElementRendererProps) {
  const headingElement = () =>
    p.element as ParsedMarkdownItem & { type: "heading" };
  const paragraphElement = () =>
    p.element as ParsedMarkdownItem & { type: "paragraph" };
  const blockquoteElement = () =>
    p.element as ParsedMarkdownItem & { type: "blockquote" };
  const tableElement = () =>
    p.element as ParsedMarkdownItem & { type: "table" };
  const imageElement = () =>
    p.element as ParsedMarkdownItem & { type: "image" };

  return (
    <Switch>
      <Match when={p.element.type === "heading" && p.element.level === 1}>
        <h1>
          <InlineContentRenderer content={headingElement().content} />
        </h1>
      </Match>
      <Match when={p.element.type === "heading" && p.element.level === 2}>
        <h2>
          <InlineContentRenderer content={headingElement().content} />
        </h2>
      </Match>
      <Match when={p.element.type === "heading" && p.element.level === 3}>
        <h3>
          <InlineContentRenderer content={headingElement().content} />
        </h3>
      </Match>
      <Match when={p.element.type === "heading" && p.element.level === 4}>
        <h4>
          <InlineContentRenderer content={headingElement().content} />
        </h4>
      </Match>
      <Match when={p.element.type === "heading" && p.element.level === 5}>
        <h5>
          <InlineContentRenderer content={headingElement().content} />
        </h5>
      </Match>
      <Match when={p.element.type === "heading" && p.element.level === 6}>
        <h6>
          <InlineContentRenderer content={headingElement().content} />
        </h6>
      </Match>
      <Match when={p.element.type === "paragraph"}>
        <p>
          <InlineContentRenderer content={paragraphElement().content} />
        </p>
      </Match>
      <Match when={p.element.type === "image"}>
        <ImageElementRenderer
          src={imageElement().src}
          alt={imageElement().alt}
          width={imageElement().width}
          height={imageElement().height}
          images={p.images}
          renderImage={p.renderImage}
        />
      </Match>
      <Match when={p.element.type === "horizontal-rule"}>
        <hr />
      </Match>
      <Match when={p.element.type === "blockquote"}>
        <blockquote>
          <InlineContentRenderer content={blockquoteElement().content} />
        </blockquote>
      </Match>
      <Match when={p.element.type === "table"}>
        <TableElementRenderer element={tableElement()} />
      </Match>
      <Match when={p.element.type === "code-block"}>
        <pre>
          <code>
            {(p.element as ParsedMarkdownItem & { type: "code-block" }).code}
          </code>
        </pre>
      </Match>
      <Match when={p.element.type === "math-block"}>
        <div class="katex-display">
          <code>
            {(p.element as ParsedMarkdownItem & { type: "math-block" }).latex}
          </code>
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
  const customElement = createMemo(() => {
    if (!p.src || !p.renderImage) return undefined;
    return p.renderImage(p.src, p.alt ?? "");
  });

  const imageFromMap = createMemo(() => {
    if (!p.src || !p.images) return undefined;
    return p.images.get(p.src);
  });

  return (
    <Show when={p.src}>
      <Switch
        fallback={
          <img src={p.src} alt={p.alt} width={p.width} height={p.height} />
        }
      >
        <Match when={customElement()}>{customElement()}</Match>
        <Match when={imageFromMap()}>
          {(info) => (
            <img
              src={info().dataUrl}
              alt={p.alt}
              width={info().width ?? p.width}
              height={info().height ?? p.height}
            />
          )}
        </Match>
      </Switch>
    </Show>
  );
}

type TableElementRendererProps = {
  element: ParsedMarkdownItem & { type: "table" };
};

function TableElementRenderer(p: TableElementRendererProps) {
  return (
    <table>
      <Show when={p.element.header && p.element.header.length > 0}>
        <thead>
          <For each={p.element.header}>
            {(row) => (
              <tr>
                <For each={row}>
                  {(cell) => (
                    <th>
                      <InlineContentRenderer content={cell.flat()} />
                    </th>
                  )}
                </For>
              </tr>
            )}
          </For>
        </thead>
      </Show>
      <Show when={p.element.rows && p.element.rows.length > 0}>
        <tbody>
          <For each={p.element.rows}>
            {(row) => (
              <tr>
                <For each={row}>
                  {(cell) => (
                    <td>
                      <InlineContentRenderer content={cell.flat()} />
                    </td>
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
  content: MarkdownInline[];
};

function InlineContentRenderer(p: InlineContentRendererProps) {
  return (
    <For each={p.content}>
      {(item) => (
        <Switch fallback={"text" in item ? item.text : undefined}>
          <Match when={item.type === "text"}>
            {(item as MarkdownInline & { type: "text" }).text}
          </Match>
          <Match when={item.type === "bold"}>
            <strong>{(item as MarkdownInline & { type: "bold" }).text}</strong>
          </Match>
          <Match when={item.type === "italic"}>
            <em>{(item as MarkdownInline & { type: "italic" }).text}</em>
          </Match>
          <Match when={item.type === "bold-italic"}>
            <strong>
              <em>
                {(item as MarkdownInline & { type: "bold-italic" }).text}
              </em>
            </strong>
          </Match>
          <Match when={item.type === "link"}>
            <a
              href={(item as MarkdownInline & { type: "link" }).url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {(item as MarkdownInline & { type: "link" }).text}
            </a>
          </Match>
          <Match when={item.type === "break"}>
            <br />
          </Match>
          <Match when={item.type === "code-inline"}>
            <code>
              {(item as MarkdownInline & { type: "code-inline" }).text}
            </code>
          </Match>
          <Match when={item.type === "math-inline"}>
            <code>
              {(item as MarkdownInline & { type: "math-inline" }).latex}
            </code>
          </Match>
        </Switch>
      )}
    </For>
  );
}
