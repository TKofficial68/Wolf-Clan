import { openDB, type IDBPDatabase } from "idb";
import type { ChatMessage } from "./chat-types";

const DB_NAME = "wolf-clan-v2";
const VERSION = 1;

type Stores =
  | "outbox"
  | "messages_cache"
  | "conversations_cache"
  | "drafts"
  | "upload_queue"
  | "read_positions"
  | "playback_positions";

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(database) {
        for (const store of [
          "outbox",
          "messages_cache",
          "conversations_cache",
          "drafts",
          "upload_queue",
          "read_positions",
          "playback_positions",
        ] as Stores[]) {
          if (!database.objectStoreNames.contains(store)) database.createObjectStore(store);
        }
      },
    });
  }
  return dbPromise;
}

export type OutboxItem = {
  id: string;
  clientMessageId: string;
  scopeKind: "dm" | "group";
  scopeId: string;
  body: string;
  messageType: string;
  replyToId: string | null;
  mediaId: string | null;
  blob: Blob | null;
  mediaName: string | null;
  mediaMime: string | null;
  mediaKind: string | null;
  attempts: number;
  createdAt: string;
  failed?: boolean;
};

async function put<T>(store: Stores, key: string, value: T): Promise<void> {
  try {
    const database = await db();
    await database.put(store, value, key);
  } catch (error) {
    console.warn("[offline] write failed", error);
  }
}

async function get<T>(store: Stores, key: string): Promise<T | undefined> {
  try {
    const database = await db();
    return (await database.get(store, key)) as T | undefined;
  } catch {
    return undefined;
  }
}

async function remove(store: Stores, key: string): Promise<void> {
  try {
    const database = await db();
    await database.delete(store, key);
  } catch {
    undefined;
  }
}

export const offline = {
  saveDraft: (scopeKey: string, value: string) => put("drafts", scopeKey, value),
  getDraft: (scopeKey: string) => get<string>("drafts", scopeKey),
  clearDraft: (scopeKey: string) => remove("drafts", scopeKey),

  cacheMessages: (scopeKey: string, messages: ChatMessage[]) =>
    put("messages_cache", scopeKey, messages.slice(-200)),
  getCachedMessages: (scopeKey: string) => get<ChatMessage[]>("messages_cache", scopeKey),

  queueMessage: (item: OutboxItem) => put("outbox", item.id, item),
  getOutboxItem: (id: string) => get<OutboxItem>("outbox", id),
  listOutbox: async (scopeKey?: string) => {
    try {
      const database = await db();
      const all = (await database.getAll("outbox")) as OutboxItem[];
      const key = scopeKey ?? "";
      return all
        .filter((item) => !scopeKey || `${item.scopeKind}:${item.scopeId}` === key)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch {
      return [];
    }
  },
  removeMessage: (id: string) => remove("outbox", id),

  saveReadPosition: (scopeKey: string, messageId: string) => put("read_positions", scopeKey, messageId),
  getReadPosition: (scopeKey: string) => get<string>("read_positions", scopeKey),

  savePlayback: (mediaId: string, position: number) => put("playback_positions", mediaId, position),
  getPlayback: (mediaId: string) => get<number>("playback_positions", mediaId),
  clearPlayback: (mediaId: string) => remove("playback_positions", mediaId),

  saveConversations: (items: unknown) => put("conversations_cache", "home", items),
  getConversations: () => get<unknown>("conversations_cache", "home"),

  outboxCount: async () => (await offline.listOutbox()).length,
};

export function scopeKey(kind: "dm" | "group", id: string): string {
  return `${kind}:${id}`;
}
