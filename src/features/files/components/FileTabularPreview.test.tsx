/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTabularPreview } from "./FileTabularPreview";
import type { FilePreviewPayload } from "../hooks/useFilePreviewPayload";

const readWorkbook = vi.fn();
const sheetToJson = vi.fn();

vi.mock("xlsx", () => ({
  read: readWorkbook,
  utils: {
    sheet_to_json: sheetToJson,
  },
}));

function makeInlinePayload(text: string): FilePreviewPayload {
  return {
    kind: "inline-bytes",
    sourceKind: "inline-bytes",
    text,
    extension: "csv",
    byteLength: text.length,
    truncated: false,
  };
}

function makeFileHandlePayload(assetUrl: string): FilePreviewPayload {
  return {
    kind: "file-handle",
    sourceKind: "file-handle",
    absolutePath: "/repo/docs/report.xlsx",
    assetUrl,
    extension: "xlsx",
    byteLength: 2048,
  };
}

describe("FileTabularPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ignores stale file-handle parses after the payload switches", async () => {
    const fetchResolverRef: { current: ((value: Response) => void) | null } = {
      current: null,
    };
    const delayedFetch = new Promise<Response>((resolve) => {
      fetchResolverRef.current = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => delayedFetch));

    readWorkbook.mockImplementation((input: unknown) => {
      if (typeof input === "string") {
        return {
          SheetNames: ["Fresh"],
          Sheets: {
            Fresh: { id: "fresh" },
          },
        };
      }
      return {
        SheetNames: ["Stale"],
        Sheets: {
          Stale: { id: "stale" },
        },
      };
    });

    sheetToJson.mockImplementation((sheet: { id: string }) => {
      if (sheet.id === "fresh") {
        return [["fresh-value"]];
      }
      return [["stale-value"]];
    });

    const { rerender } = render(
      <FileTabularPreview
        payload={makeFileHandlePayload("asset://report.xlsx")}
        isLoading={false}
        error={null}
        t={(key) => key}
      />,
    );

    rerender(
      <FileTabularPreview
        payload={makeInlinePayload("name,value\nfresh-value,1")}
        isLoading={false}
        error={null}
        t={(key) => key}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("fresh-value")).toBeTruthy();
    });

    const settleFetch = fetchResolverRef.current;
    if (!settleFetch) {
      throw new Error("Expected stale fetch resolver to be available.");
    }
    settleFetch(
      new Response(new Uint8Array([1, 2, 3]).buffer, {
        status: 200,
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText("stale-value")).toBeNull();
    });
  });

  it("fails closed before fetching oversized workbook payloads", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <FileTabularPreview
        payload={{
          ...makeFileHandlePayload("asset://oversized.xlsx"),
          byteLength: 12 * 1024 * 1024,
        }}
        isLoading={false}
        error={null}
        t={(key, options) =>
          key === "files.tabularPreviewTooLarge"
            ? `too-large-${String(options?.maxMb)}`
            : key
        }
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("too-large-8")).toBeTruthy();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
