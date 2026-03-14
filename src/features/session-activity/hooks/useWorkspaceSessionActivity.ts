import { useMemo, useRef } from "react";
import type { ConversationItem, ThreadSummary } from "../../../types";
import * as workspaceSessionActivityAdapter from "../adapters/buildWorkspaceSessionActivity";
import type { WorkspaceSessionActivityThreadSnapshot } from "../adapters/buildWorkspaceSessionActivity";

type ThreadStatusSnapshot = {
  isProcessing?: boolean;
};

type UseWorkspaceSessionActivityOptions = {
  activeThreadId: string | null;
  threads: ThreadSummary[];
  itemsByThread: Record<string, ConversationItem[]>;
  threadParentById: Record<string, string>;
  threadStatusById: Record<string, ThreadStatusSnapshot | undefined>;
};

export function useWorkspaceSessionActivity({
  activeThreadId,
  threads,
  itemsByThread,
  threadParentById,
  threadStatusById,
}: UseWorkspaceSessionActivityOptions) {
  const eventOccurredAtRef = useRef<Record<string, number>>({});
  const eventSequenceRef = useRef(0);
  const cachedThreadSnapshotsRef = useRef<Record<string, WorkspaceSessionActivityThreadSnapshot>>({});
  const cachedThreadSignaturesRef = useRef<Record<string, string>>({});

  return useMemo(
    () => {
      const context = workspaceSessionActivityAdapter.resolveWorkspaceSessionActivityContext({
        activeThreadId,
        threads,
        itemsByThread,
        threadParentById,
        threadStatusById,
      });
      const nextViewModel = context
        ? (() => {
            const nextThreadSnapshotsById: Record<string, WorkspaceSessionActivityThreadSnapshot> = {};
            const nextThreadSignaturesById: Record<string, string> = {};

            const fingerprintItem = (item: ConversationItem | undefined) => {
              if (!item) {
                return "";
              }
              if (item.kind === "tool") {
                return [
                  item.id,
                  item.kind,
                  item.toolType,
                  item.status ?? "",
                  item.title ?? "",
                  item.output?.length ?? 0,
                  item.changes?.length ?? 0,
                ].join(":");
              }
              if (item.kind === "reasoning") {
                return [
                  item.id,
                  item.kind,
                  item.summary.length,
                  item.content.length,
                ].join(":");
              }
              if (item.kind === "explore") {
                return [
                  item.id,
                  item.kind,
                  item.status ?? "",
                  Array.isArray(item.entries) ? item.entries.length : 0,
                ].join(":");
              }
              if (item.kind === "message") {
                return [item.id, item.kind, item.role, item.text.length].join(":");
              }
              return [item.id, item.kind].join(":");
            };

            for (const threadContext of context.relevantThreads) {
              const threadId = threadContext.thread.id;
              const items = itemsByThread[threadId] ?? [];
              const lastItem = items[items.length - 1];
              const previousItem = items[items.length - 2];
              const signature = [
                threadId,
                threadContext.thread.name ?? "",
                String(threadContext.thread.updatedAt ?? 0),
                String(threadContext.threadIsProcessing),
                threadContext.relationshipSource,
                String(items.length),
                fingerprintItem(items[0]),
                fingerprintItem(previousItem),
                fingerprintItem(lastItem),
              ].join("|");

              nextThreadSignaturesById[threadId] = signature;

              const previousSignature = cachedThreadSignaturesRef.current[threadId];
              const cachedSnapshot = cachedThreadSnapshotsRef.current[threadId];
              if (previousSignature === signature && cachedSnapshot) {
                nextThreadSnapshotsById[threadId] = cachedSnapshot;
                continue;
              }

              nextThreadSnapshotsById[threadId] = workspaceSessionActivityAdapter.buildThreadActivity({
                ...threadContext,
                items,
              });
            }

            cachedThreadSnapshotsRef.current = nextThreadSnapshotsById;
            cachedThreadSignaturesRef.current = nextThreadSignaturesById;

            return workspaceSessionActivityAdapter.composeWorkspaceSessionActivityViewModel({
              rootThreadId: context.rootThreadId,
              rootThreadName: context.rootThreadName,
              threadSnapshots: context.relevantThreads.map(
                (threadContext) => nextThreadSnapshotsById[threadContext.thread.id],
              ),
            });
          })()
        : workspaceSessionActivityAdapter.buildWorkspaceSessionActivity({
            activeThreadId,
            threads,
            itemsByThread,
            threadParentById,
            threadStatusById,
          });
      const seenEventIds = new Set<string>();
      const normalizedTimeline = nextViewModel.timeline.map((event) => {
        if (!seenEventIds.has(event.eventId)) {
          seenEventIds.add(event.eventId);
          return event;
        }
        const scopedToken = [
          event.threadId,
          event.turnId ?? "",
          typeof event.turnIndex === "number" ? String(event.turnIndex) : "",
          String(event.occurredAt),
        ]
          .filter(Boolean)
          .join(":");
        let dedupedEventId = scopedToken
          ? `${event.eventId}::${scopedToken}`
          : `${event.eventId}::dup`;
        let fallbackIndex = 1;
        while (seenEventIds.has(dedupedEventId)) {
          fallbackIndex += 1;
          dedupedEventId = `${event.eventId}::dup:${fallbackIndex}`;
        }
        seenEventIds.add(dedupedEventId);
        return {
          ...event,
          eventId: dedupedEventId,
        };
      });

      const previousOccurredAtByEventId = eventOccurredAtRef.current;
      const nextOccurredAtByEventId: Record<string, number> = {};
      const occupiedSeconds = new Set<number>();
      const nowBase = Date.now();
      let eventSequence = eventSequenceRef.current;

      // Reserve second buckets for still-visible historical events first,
      // so newly appeared events don't collapse into the same HH:mm:ss slot.
      for (const event of normalizedTimeline) {
        const previousOccurredAt = previousOccurredAtByEventId[event.eventId];
        if (typeof previousOccurredAt === "number" && Number.isFinite(previousOccurredAt) && previousOccurredAt > 0) {
          occupiedSeconds.add(Math.floor(previousOccurredAt / 1000));
        }
      }

      const reserveDistinctSecond = (timestamp: number) => {
        let nextTimestamp = timestamp;
        let secondBucket = Math.floor(nextTimestamp / 1000);
        while (occupiedSeconds.has(secondBucket)) {
          nextTimestamp += 1000;
          secondBucket = Math.floor(nextTimestamp / 1000);
        }
        occupiedSeconds.add(secondBucket);
        return nextTimestamp;
      };

      const timeline = normalizedTimeline
        .map((event) => {
          const previousOccurredAt = previousOccurredAtByEventId[event.eventId];
          if (typeof previousOccurredAt === "number" && previousOccurredAt > 0) {
            nextOccurredAtByEventId[event.eventId] = previousOccurredAt;
            if (previousOccurredAt === event.occurredAt) {
              return event;
            }
            return {
              ...event,
              occurredAt: previousOccurredAt,
            };
          }

          const fromAdapter =
            typeof event.occurredAt === "number" && Number.isFinite(event.occurredAt)
              ? event.occurredAt
              : null;
          const fallbackTimestamp = nowBase - eventSequence * 1000;
          if (!fromAdapter) {
            eventSequence += 1;
          }
          const occurredAt = reserveDistinctSecond(fromAdapter ?? fallbackTimestamp);
          nextOccurredAtByEventId[event.eventId] = occurredAt;
          if (occurredAt === event.occurredAt) {
            return event;
          }
          return {
            ...event,
            occurredAt,
          };
        })
        .sort((left, right) => right.occurredAt - left.occurredAt);

      eventOccurredAtRef.current = nextOccurredAtByEventId;
      eventSequenceRef.current = eventSequence;

      return {
        ...nextViewModel,
        timeline,
      };
    },
    [activeThreadId, itemsByThread, threadParentById, threadStatusById, threads],
  );
}
