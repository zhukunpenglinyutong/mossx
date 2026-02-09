/** @vitest-environment jsdom */
import { createRef } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useComposerAutocompleteState } from "./useComposerAutocompleteState";

describe("useComposerAutocompleteState file mentions", () => {
  it("suggests a file even if it is already mentioned earlier in the message", () => {
    const files = ["src/App.tsx", "src/main.tsx"];
    const text = "Please review @src/App.tsx and also @";
    const selectionStart = text.length;
    const textareaRef = createRef<HTMLTextAreaElement>();
    textareaRef.current = {
      focus: vi.fn(),
      setSelectionRange: vi.fn(),
    } as unknown as HTMLTextAreaElement;

    const { result } = renderHook(() =>
      useComposerAutocompleteState({
        text,
        selectionStart,
        disabled: false,
        skills: [],
        prompts: [],
        files,
        textareaRef,
        setText: vi.fn(),
        setSelectionStart: vi.fn(),
      }),
    );

    expect(result.current.isAutocompleteOpen).toBe(true);
    expect(result.current.autocompleteMatches.map((item) => item.label)).toContain(
      "src/App.tsx",
    );
  });
});

describe("useComposerAutocompleteState slash commands", () => {
  it("includes built-in slash commands in alphabetical order", () => {
    const text = "/";
    const selectionStart = text.length;
    const textareaRef = createRef<HTMLTextAreaElement>();
    textareaRef.current = {
      focus: vi.fn(),
      setSelectionRange: vi.fn(),
    } as unknown as HTMLTextAreaElement;

    const { result } = renderHook(() =>
      useComposerAutocompleteState({
        text,
        selectionStart,
        disabled: false,
        skills: [],
        prompts: [],
        files: [],
        textareaRef,
        setText: vi.fn(),
        setSelectionStart: vi.fn(),
      }),
    );

    const labels = result.current.autocompleteMatches.map((item) => item.label);
    expect(labels).toEqual(
      expect.arrayContaining(["fork", "mcp", "new", "resume", "review", "status"]),
    );
    expect(labels.slice(0, 6)).toEqual([
      "fork",
      "mcp",
      "new",
      "resume",
      "review",
      "status",
    ]);
  });
});

describe("useComposerAutocompleteState skills", () => {
  it("shows skills in slash autocomplete", () => {
    const text = "/find";
    const selectionStart = text.length;
    const textareaRef = createRef<HTMLTextAreaElement>();
    textareaRef.current = {
      focus: vi.fn(),
      setSelectionRange: vi.fn(),
    } as unknown as HTMLTextAreaElement;

    const { result } = renderHook(() =>
      useComposerAutocompleteState({
        text,
        selectionStart,
        disabled: false,
        skills: [{ name: "find-skills", description: "discover skills" }],
        prompts: [],
        files: [],
        textareaRef,
        setText: vi.fn(),
        setSelectionStart: vi.fn(),
      }),
    );

    expect(result.current.autocompleteMatches.map((item) => item.label)).toContain(
      "find-skills",
    );
  });

  it("shows skills in dollar autocomplete", () => {
    const text = "$find";
    const selectionStart = text.length;
    const textareaRef = createRef<HTMLTextAreaElement>();
    textareaRef.current = {
      focus: vi.fn(),
      setSelectionRange: vi.fn(),
    } as unknown as HTMLTextAreaElement;

    const { result } = renderHook(() =>
      useComposerAutocompleteState({
        text,
        selectionStart,
        disabled: false,
        skills: [{ name: "find-skills", description: "discover skills" }],
        prompts: [],
        files: [],
        textareaRef,
        setText: vi.fn(),
        setSelectionStart: vi.fn(),
      }),
    );

    expect(result.current.autocompleteMatches.map((item) => item.label)).toContain(
      "find-skills",
    );
  });
});
