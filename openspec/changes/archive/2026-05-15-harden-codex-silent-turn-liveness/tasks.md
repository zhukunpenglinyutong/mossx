## 1. Liveness State Contract

- [x] 1.1 [P0][depends:none][I: `proposal.md` + Codex liveness specs][O: frontend-visible `suspected-silent` reason/state contract][V: type/unit tests show frontend-only no-progress does not produce terminal stalled] Define the non-terminal Codex suspected-silent state.
- [x] 1.2 [P0][depends:1.1][I: existing Codex no-progress timer][O: frontend no-progress timeout routed to soft-suspect path][V: focused Vitest confirms no quarantine / no terminal external settlement from frontend timeout] Convert 600s no-progress handling to soft suspicion.
- [x] 1.3 [P0][depends:1.1][I: existing hard stalled / quarantine paths][O: authoritative-only hard settlement gate][V: focused Vitest confirms backend stalled/error/runtime-ended and user stop still settle deterministically] Restrict hard stalled / quarantine to authoritative sources.

## 2. Progress Evidence Expansion

- [x] 2.1 [P0][depends:1.1][I: `processing/heartbeat` handling][O: heartbeat refreshes Codex turn progress evidence][V: focused Vitest prevents suspected-silent while correlated heartbeats arrive] Wire heartbeat into Codex progress evidence.
- [x] 2.2 [P0][depends:1.1][I: thread status and runtime status events][O: active/running status refreshes liveness][V: focused Vitest covers status-active before timeout] Treat active status changes as progress evidence.
- [x] 2.3 [P0][depends:1.1][I: item/tool/file-change/approval/user-input updates][O: structured activity refreshes liveness][V: focused Vitest covers item update and tool activity without assistant text] Treat structured non-text runtime activity as progress evidence.

## 3. Recovery And Diagnostics

- [x] 3.1 [P0][depends:1.2,2.1,2.2,2.3][I: soft-suspect state + realtime event handlers][O: late matching progress clears suspected-silent][V: focused Vitest covers late delta/heartbeat/item update restoring normal processing] Implement automatic late-event recovery for soft-suspect turns.
- [x] 3.2 [P0][depends:1.3][I: existing liveness diagnostics][O: source-distinguished diagnostics][V: tests assert `frontend-no-progress-suspected` and authoritative stalled sources are distinguishable] Record suspicion vs settlement source in diagnostics.
- [x] 3.3 [P1][depends:3.1][I: existing processing UI copy/state][O: passive suspected-silent UI with Stop still available][V: component/hook tests or manual check confirms no blocking debug interaction is required] Add low-interruption UI presentation for suspected silence.

## 4. Verification

- [x] 4.1 [P0][depends:3.2][I: OpenSpec change artifacts][O: valid OpenSpec change][V: `openspec validate harden-codex-silent-turn-liveness --strict --no-interactive`] Validate the proposal/design/spec/tasks.
- [x] 4.2 [P0][depends:3.3][I: affected frontend hook tests][O: focused regression suite][V: run focused Vitest suites for `useThreadEventHandlers` / Codex liveness behavior] Run targeted frontend tests.
- [x] 4.3 [P1][depends:4.2][I: manual concurrent Codex scenario][O: manual evidence note][V: three concurrent Codex turns can stay monitorable; frontend-only silence does not quarantine without authoritative settlement] Repeat the 3-session manual scenario after implementation.
