import MarkdownIt from "markdown-it";
import type { Component } from "solid-js";
import type { DisplayItem } from "panther";

const md = new MarkdownIt();

export const MarkdownTextRenderer: Component<{
  item: Extract<DisplayItem, { type: "text" }>;
}> = (props) => {
  if (props.item.role === "user") {
    return (
      <div class="ui-pad ml-auto max-w-[80%] rounded bg-blue-100 text-right">
        <div class="whitespace-pre-wrap font-mono text-sm text-blue-900">
          {props.item.text}
        </div>
      </div>
    );
  }

  return (
    <div
      class="ui-pad bg-primary/10 text-primary w-fit max-w-full rounded font-mono text-sm [&_code]:bg-base-200 [&_pre]:bg-base-200 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_em]:italic [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-bold [&_li]:ml-2 [&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:my-2 [&_pre]:my-3 [&_pre]:rounded [&_pre]:p-2 [&_strong]:font-bold [&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc"
      innerHTML={md.render(props.item.text)}
    />
  );
};
