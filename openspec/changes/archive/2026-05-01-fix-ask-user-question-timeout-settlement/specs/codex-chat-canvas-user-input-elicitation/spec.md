## MODIFIED Requirements

### Requirement: RequestUserInput Stale Timeout Settlement MUST Release The Pending Dialog

When a user-input request has already been settled by runtime timeout, the frontend MUST treat a later empty cancel response as stale settlement rather than a retryable submission failure.

#### Scenario: Claude AskUserQuestion cancel arrives after backend timeout
- **GIVEN** a Claude Code `AskUserQuestion` request is visible in the frontend queue
- **AND** the backend has already timed out and cleared the pending request
- **WHEN** the user cancels the dialog or the frontend timeout submits an empty response
- **THEN** the frontend MUST remove the pending request from the queue
- **AND** the thread MUST clear the optimistic processing marker created for that response attempt
- **AND** the frontend MUST NOT insert a submitted-answer history item for the stale response

#### Scenario: ordinary submit failure remains retryable
- **GIVEN** a user-input request is still expected to be answerable
- **WHEN** sending the answer fails with an ordinary backend or bridge error
- **THEN** the frontend MUST keep the request visible
- **AND** the user MUST be able to retry or cancel again
