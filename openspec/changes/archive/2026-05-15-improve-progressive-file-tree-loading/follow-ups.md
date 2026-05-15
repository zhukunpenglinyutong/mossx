# Follow-ups

## Directory Pagination

Phase 1 exposes `partial` and `has_more` state for oversized directory-child responses, but it does not add a user-facing cursor or Load More interaction.

If real projects hit a single directory with more direct children than the current bounded response can return, add a follow-up OpenSpec change for cursor-based directory pagination. That follow-up should keep the current one-level fetch contract and extend it with stable sort keys or cursor tokens instead of increasing the initial scan budget.
