## 1. Implementation

- [x] 1.1 Extend Linux startup context with IME environment signals.
- [x] 1.2 Add pure IME env resolution that only fills missing GTK/Qt module variables.
- [x] 1.3 Apply resolved IME env before WebView creation.
- [x] 1.4 Log IME env repair decisions without exposing sensitive values beyond module names.

## 2. Tests

- [x] 2.1 Cover fcitx/RIME-style `XMODIFIERS=@im=fcitx` repair.
- [x] 2.2 Cover ibus repair.
- [x] 2.3 Cover explicit env preservation.
- [x] 2.4 Cover no-signal no-op.

## 3. Validation

- [x] 3.1 Run focused Rust tests for `linux_startup_guard`.
- [x] 3.2 Run strict OpenSpec validation for this change.
