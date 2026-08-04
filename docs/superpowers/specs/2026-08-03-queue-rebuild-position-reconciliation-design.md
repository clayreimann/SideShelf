# Queue-Rebuild Position Reconciliation Design

## Problem

Rebuilding TrackPlayer's queue produces native progress reports for internal
positions that are not user jumps. After `reset()` and `add()`, iOS can report
`0` even after `seekTo(resumePosition)` resolves. The coordinator has already
marked the queue valid by the time that queued report is processed, so the
report can overwrite the restored position and enter jump history. A later
report at the resume position creates the opposite false jump.

## Design

The coordinator will own a bounded queue-rebuild reconciliation record for the
active item. It contains the positions the native player may legitimately
report while settling and the final target position. The record is armed after
the queue rebuild and any immediately following smart rewind have completed,
but before the current serialized `PLAY` event releases queued native events.

During reconciliation:

- Reports at transient positions, including the reset position `0` and an
  intermediate pre-smart-rewind resume position, update duration/timing only.
  They do not change position or create history.
- Reports at the final target update position normally but do not create
  history. The record remains briefly active so late transient reports are
  still suppressed.
- The first unrelated position clears the record and is handled normally.
- Explicit seeks, relative jumps, track changes, restoration, stop, and errors
  clear the record before their native reports arrive.
- A timeout clears a reconciliation that never settles.

This is queue-specific. Existing smart-rewind-only reconciliation keeps its
current behavior when no queue rebuild occurred.

## Safety

The implementation must not globally ignore zero. An explicit seek or relative
jump to `0` cancels reconciliation first and remains a normal intentional jump.
A later unrelated native jump to `0` must also remain detectable.

## Testing

Coordinator tests will reproduce the native sequence `0 -> target` after an
inline queue rebuild and verify that zero is never projected or recorded. They
will also verify that an explicit seek to `0` cancels reconciliation and is
recorded, and that unrelated native movement after reconciliation remains
detectable.

## Scope

This change covers inline cold-start/error-retry queue rebuilds performed by
the coordinator. It does not change session persistence, progress-source
priority, or ordinary explicit seek behavior.
