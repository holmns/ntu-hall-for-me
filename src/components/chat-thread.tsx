"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { sendMessage, type SendMessageState } from "@/app/messages/actions";

export type ChatMessage = {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
};

const POLL_INTERVAL_MS = 4000;

export function ChatThread({
  listingId,
  peerId,
  peerName,
  currentUserId,
  initialMessages,
}: {
  listingId: string;
  peerId: string;
  peerName: string;
  currentUserId: string;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  // Set when the poll 404s, which means the provider deleted the listing while
  // this thread was open.
  const [gone, setGone] = useState(false);
  const [state, formAction, isPending] = useActionState<
    SendMessageState,
    FormData
  >(sendMessage, {});
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Polling stands in for Supabase Realtime.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/messages/${listingId}/${peerId}`, {
          cache: "no-store",
        });
        // A deleted listing takes its messages with it, so there is nothing
        // left to poll for - say so instead of looking live.
        if (res.status === 404) {
          clearInterval(timer);
          if (!cancelled) setGone(true);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { messages: ChatMessage[] };
        if (!cancelled) setMessages(data.messages);
      } catch {
        // Transient failure - the next tick will retry.
      }
    }
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [listingId, peerId]);

  // Clear the input and refresh right after a successful send.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      fetch(`/api/messages/${listingId}/${peerId}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setMessages(data.messages))
        .catch(() => {});
    }
  }, [state, listingId, peerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="card flex h-[min(600px,70vh)] flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-[14px] font-medium text-ink">No messages yet</p>
            <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-ink-soft">
              Say hello to {peerName}. Mention when you would move in and how
              long you need the room - it saves a round trip.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.senderId === currentUserId;
            return (
              <div
                key={message.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed ${
                    mine
                      ? "rounded-br-md bg-brand text-white"
                      : "rounded-bl-md bg-surface-muted text-ink"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                  <p
                    className={`mt-1 text-[11px] tabular-nums ${
                      mine ? "text-white/70" : "text-ink-faint"
                    }`}
                  >
                    {new Date(message.createdAt).toLocaleTimeString("en-SG", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {gone ? (
        <div className="border-t border-line bg-surface-muted px-4 py-3.5 text-[13px] leading-relaxed text-ink-soft">
          <span className="font-medium text-ink">
            This listing was deleted.
          </span>{" "}
          The provider removed the room, so the conversation is closed and will
          not be here next time.
        </div>
      ) : (
        <form
          ref={formRef}
          action={formAction}
          className="border-t border-line bg-surface p-3"
        >
          <input type="hidden" name="listingId" value={listingId} />
          <input type="hidden" name="peerId" value={peerId} />
          <div className="flex items-end gap-2">
            <textarea
              name="content"
              rows={1}
              required
              maxLength={2000}
              placeholder={`Message ${peerName}...`}
              aria-label="Message"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              className="field max-h-32 min-h-[42px] flex-1 resize-none py-2.5"
            />
            <button
              type="submit"
              disabled={isPending}
              className="btn-primary shrink-0 !px-4"
            >
              {isPending ? "..." : "Send"}
            </button>
          </div>
          {state.error && (
            <p className="mt-2 text-xs text-brand">{state.error}</p>
          )}
          <p className="mt-2 text-[11px] text-ink-faint">
            Updates every {POLL_INTERVAL_MS / 1000}s. Never send payment before
            viewing a room in person.
          </p>
        </form>
      )}
    </div>
  );
}
