import { beforeEach, describe, expect, it, vi } from "vitest";

const clientStorageMocks = vi.hoisted(() => ({
  getClientStoreSync: vi.fn(),
  writeClientStoreValue: vi.fn(),
}));

vi.mock("../../../services/clientStorage", () => ({
  getClientStoreSync: clientStorageMocks.getClientStoreSync,
  writeClientStoreValue: clientStorageMocks.writeClientStoreValue,
}));

import {
  buildUpdatedThreadAliases,
  loadThreadAliases,
  resolveCanonicalThreadAlias,
  saveThreadAliases,
} from "./threadStorage";

describe("threadStorage aliases", () => {
  beforeEach(() => {
    clientStorageMocks.getClientStoreSync.mockReset();
    clientStorageMocks.writeClientStoreValue.mockReset();
  });

  it("loads only valid persisted thread aliases", () => {
    clientStorageMocks.getClientStoreSync.mockReturnValueOnce({
      "thread-stale": "thread-recovered",
      " ": "thread-blank",
      "thread-loop": "thread-loop",
      "thread-empty": "   ",
    });

    expect(loadThreadAliases()).toEqual({
      "thread-stale": "thread-recovered",
    });
  });

  it("ignores corrupted persisted alias payloads and removes cyclic chains", () => {
    clientStorageMocks.getClientStoreSync
      .mockReturnValueOnce(["thread-a", "thread-b"])
      .mockReturnValueOnce({
        "thread-a": "thread-b",
        "thread-b": "thread-a",
        "thread-c": 123,
      });

    expect(loadThreadAliases()).toEqual({});
    expect(loadThreadAliases()).toEqual({});
  });

  it("collapses alias chains onto the latest canonical thread id", () => {
    const aliases = buildUpdatedThreadAliases(
      {
        "thread-old": "thread-stale",
        "thread-stale": "thread-current",
      },
      "thread-current",
      "thread-next",
    );

    expect(aliases).toEqual({
      "thread-old": "thread-next",
      "thread-stale": "thread-next",
      "thread-current": "thread-next",
    });
    expect(resolveCanonicalThreadAlias(aliases, "thread-old")).toBe("thread-next");
  });

  it("persists normalized alias maps", () => {
    saveThreadAliases({
      "thread-a": "thread-b",
      "thread-b": "thread-b",
      "thread-c": "thread-d",
      "thread-d": "thread-e",
    });

    expect(clientStorageMocks.writeClientStoreValue).toHaveBeenCalledWith(
      "threads",
      "threadAliases",
      {
        "thread-a": "thread-b",
        "thread-c": "thread-e",
        "thread-d": "thread-e",
      },
    );
  });
});
