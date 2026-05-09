## 1. Reconnect Signal

- [x] 1.1 Emit a browser-local reconnect event from the Web service shim only after a socket reconnect, not on first connect.
- [x] 1.2 Expose the event name through frontend event helpers to avoid string drift.

## 2. State Compensation

- [x] 2.1 Listen for the reconnect event in thread orchestration only in Web service mode.
- [x] 2.2 Refresh only the active workspace thread list with preserved state.
- [x] 2.3 Refresh the active thread only when it is still marked processing.

## 3. Validation

- [x] 3.1 Add focused tests for reconnect compensation behavior.
- [x] 3.2 Run targeted tests and OpenSpec validation.
