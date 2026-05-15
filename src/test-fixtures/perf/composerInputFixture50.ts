export type ComposerInputStep =
  | {
      kind: "input";
      value: string;
      atMs: number;
    }
  | {
      kind: "composition-start" | "composition-end";
      value: string;
      atMs: number;
    };

export const composerInputFixture50: ComposerInputStep[] = Array.from(
  "baseline input latency fixture text with fifty chars!",
).slice(0, 50).map((value, index) => ({
  kind: "input",
  value,
  atMs: index * 16,
}));
