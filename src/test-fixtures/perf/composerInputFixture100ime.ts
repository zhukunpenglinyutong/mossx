import type { ComposerInputStep } from "./composerInputFixture50";

const baseText = Array.from("ime baseline input latency fixture text with exactly fifty chars").slice(0, 50);

export const composerInputFixture100ime: ComposerInputStep[] = baseText.flatMap((value, index) => {
  const atMs = index * 16;
  if (index % 5 !== 0) {
    return [{ kind: "input", value, atMs }];
  }
  return [
    { kind: "composition-start", value, atMs },
    { kind: "input", value, atMs: atMs + 4 },
    { kind: "composition-end", value, atMs: atMs + 8 },
  ];
});
