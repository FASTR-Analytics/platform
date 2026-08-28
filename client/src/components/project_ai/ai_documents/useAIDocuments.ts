import {
  createEffect,
  createMemo,
  createSignal,
  onMount,
  type Accessor,
} from "solid-js";
import { openComponent, type MessageParam } from "panther";
import {
  getPendingAttachments,
  getUploadsForProject,
  setPendingAttachments,
  type UploadedDocument,
} from "~/state/project/t4_ai_documents";
import { AIDocumentSelectorModal } from "./AIDocumentSelectorModal";

type SentDocument = {
  fileId: string;
  title: string;
};

type BoundConversation = {
  conversationId: Accessor<string>;
  messages: Accessor<MessageParam[]>;
};

type UseAIDocumentsOptions = {
  projectId: string;
};

// Constructed at the wrapper level (config.getDocumentRefs must exist before
// AIChatProvider mounts) but the active conversation only exists inside the
// provider — the chat pane late-binds its accessors via bind(). Sends can
// only originate inside the provider, so binding always precedes the first
// getDocumentRefs call.
export function useAIDocuments(options: UseAIDocumentsOptions) {
  const [registry, setRegistry] = createSignal<UploadedDocument[]>([]);
  const [pending, setPending] = createSignal<string[]>([]);
  const [bound, setBound] = createSignal<BoundConversation | null>(null);

  onMount(async () => {
    setRegistry(await getUploadsForProject(options.projectId));
  });

  function bind(
    conversationId: Accessor<string>,
    messages: Accessor<MessageParam[]>,
  ) {
    setBound({ conversationId, messages });
  }

  const conversationId = () => bound()?.conversationId() ?? null;

  // Load the bound conversation's pending list eagerly at bind and on every
  // switch. The post-await guard drops a stale load overtaken by a switch;
  // a send landing inside the load window gets [] and the doc rides the
  // NEXT message via the engine's not-yet-sent filter.
  createEffect(async () => {
    const id = conversationId();
    setPending([]);
    if (id === null) return;
    const loaded = await getPendingAttachments(options.projectId, id);
    if (conversationId() === id) {
      setPending(loaded);
    }
  });

  const sentDocs = createMemo<SentDocument[]>(() => {
    const msgs = bound()?.messages() ?? [];
    const out: SentDocument[] = [];
    const seen = new Set<string>();
    for (const msg of msgs) {
      if (typeof msg.content === "string") continue;
      for (const block of msg.content) {
        if (
          block.type === "document" &&
          block.source.type === "file" &&
          block.title !== undefined &&
          !seen.has(block.source.file_id)
        ) {
          seen.add(block.source.file_id);
          out.push({ fileId: block.source.file_id, title: block.title });
        }
      }
    }
    return out;
  });

  // Keep the pending store true to "not yet ridden": once a pending doc's
  // file_id appears in history, drop it. A user message persisted by a
  // failed turn counts as ridden, matching the engine's already-sent filter.
  createEffect(() => {
    const id = conversationId();
    const current = pending();
    const reg = registry();
    const sentIds = new Set(sentDocs().map((d) => d.fileId));
    if (id === null || current.length === 0) return;
    const pruned = current.filter((filename) => {
      const upload = reg.find((u) => u.assetFilename === filename);
      return upload === undefined || !sentIds.has(upload.anthropicFileId);
    });
    if (pruned.length === current.length) return;
    setPending(pruned);
    setPendingAttachments(options.projectId, id, pruned);
  });

  function getDocumentRefs(): { file_id: string; title: string }[] {
    const reg = registry();
    return pending().flatMap((filename) => {
      const upload = reg.find((u) => u.assetFilename === filename);
      return upload === undefined
        ? []
        : [{ file_id: upload.anthropicFileId, title: filename }];
    });
  }

  async function openSelector() {
    const id = conversationId();
    if (id === null) return;
    const result = await openComponent<
      {
        projectId: string;
        conversationId: string;
        sentFilenames: string[];
        pendingFilenames: string[];
      },
      string[] | undefined
    >({
      element: AIDocumentSelectorModal,
      props: {
        projectId: options.projectId,
        conversationId: id,
        sentFilenames: sentDocs().map((d) => d.title),
        pendingFilenames: pending(),
      },
    });
    if (result) {
      setPending(result);
      setRegistry(await getUploadsForProject(options.projectId));
    }
  }

  function removePendingAttachment(assetFilename: string) {
    const id = conversationId();
    if (id === null) return;
    const next = pending().filter((f) => f !== assetFilename);
    setPending(next);
    setPendingAttachments(options.projectId, id, next);
  }

  return {
    bind,
    sentDocs,
    pending,
    openSelector,
    removePendingAttachment,
    getDocumentRefs,
  };
}
