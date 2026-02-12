// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AlertComponentProps,
  type BulkAction,
  Button,
  createMemo,
  createSignal,
  ModalContainer,
  Show,
  Table,
  type TableColumn,
} from "../deps.ts";
import type { ConversationMetadata } from "../_core/conversations_persistence.ts";
import type { ConversationsContextValue } from "./use_conversations.ts";

type Props = {
  conversations: ConversationsContextValue;
};

type ReturnType = undefined;

export function AIChatConversationSelector(
  p: AlertComponentProps<Props, ReturnType>,
) {
  const conversations = p.conversations;
  const [deleting, setDeleting] = createSignal<string | null>(null);
  const [selectedKeys, setSelectedKeys] = createSignal<Set<string>>(new Set());

  const handleSelect = (conv: ConversationMetadata) => {
    conversations.switchTo(conv.id);
    p.close(undefined);
  };

  const handleNew = async () => {
    await conversations.createConversation();
    p.close(undefined);
  };

  const handleDelete = async (convId: string, e: MouseEvent) => {
    e.stopPropagation();
    const current = conversations.activeConversationId();
    if (convId === current) return;
    setDeleting(convId);
    await conversations.deleteConversation(convId);
    setDeleting(null);
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
      });
    }
  };

  const handleBulkSwitch = (items: ConversationMetadata[]) => {
    if (items.length !== 1) {
      return false;
    }
    conversations.switchTo(items[0].id);
    p.close(undefined);
  };

  const handleBulkDelete = async (items: ConversationMetadata[]) => {
    const activeId = conversations.activeConversationId();
    const toDelete = items.filter((conv) => conv.id !== activeId);

    if (toDelete.length === 0) {
      return false;
    }

    setDeleting("bulk");
    for (const conv of toDelete) {
      await conversations.deleteConversation(conv.id);
    }
    setDeleting(null);

    return "CLEAR_SELECTION";
  };

  const bulkActions = createMemo(() => {
    const actions: BulkAction<ConversationMetadata>[] = [];

    if (selectedKeys().size === 1) {
      actions.push({
        label: "Switch to Conversation",
        intent: "primary",
        onClick: handleBulkSwitch,
      });
    }

    actions.push({
      label: "Delete Selected",
      intent: "danger",
      outline: true,
      onClick: handleBulkDelete,
    });

    return actions;
  });

  const columns: TableColumn<ConversationMetadata>[] = [
    {
      key: "title",
      header: "Conversation",
      sortable: true,
      render: (conv) => (
        <div class="flex min-w-0 items-center gap-2">
          <Show when={conv.id === conversations.activeConversationId()}>
            <div class="bg-primary h-2 w-2 flex-shrink-0 rounded-full" />
          </Show>
          <span
            class={`truncate ${
              conv.id === conversations.activeConversationId()
                ? "text-primary font-semibold"
                : ""
            }`}
          >
            {conv.title}
          </span>
        </div>
      ),
    },
    {
      key: "lastMessageAt",
      header: "Last Active",
      sortable: true,
      render: (conv) => (
        <span class="text-neutral text-sm">
          {formatDate(conv.lastMessageAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "80px",
      render: (conv) =>
        conv.id === conversations.activeConversationId()
          ? <div />
          : (
            <div class="flex justify-end">
              <Button
                size="sm"
                intent="danger"
                outline
                iconName="trash"
                onClick={(e) => handleDelete(conv.id, e)}
                disabled={deleting() === conv.id}
              />
            </div>
          ),
    },
  ];

  return (
    <ModalContainer
      title="Conversations"
      width="lg"
      leftButtons={[
        <Button intent="primary" onClick={handleNew} iconName="plus">
          New Conversation
        </Button>,
        <Button intent="neutral" onClick={() => p.close(undefined)}>
          Close
        </Button>,
      ]}
    >
      <Show
        when={conversations.conversations().length > 0}
        fallback={
          <div class="text-neutral py-8 text-center">No conversations yet</div>
        }
      >
        <Table
          data={conversations.conversations()}
          columns={columns}
          keyField="id"
          defaultSort={{ key: "lastMessageAt", direction: "desc" }}
          onRowClick={handleSelect}
          bulkActions={bulkActions()}
          selectionLabel="conversation"
          selectedKeys={selectedKeys}
          setSelectedKeys={setSelectedKeys}
          paddingY="comfortable"
          paddingX="comfortable"
        />
      </Show>
    </ModalContainer>
  );
}
