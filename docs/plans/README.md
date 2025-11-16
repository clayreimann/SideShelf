# Implementation Plans

This directory contains focused, actionable implementation plans for major features and refactorings.

## Active Plans

### [State Machine Migration](./state-machine-migration.md)
Phased migration from implicit state flags to event-driven state machine for player synchronization.

**Status:** Phase 1 complete (observer mode)
**Timeline:** 4-6 weeks total
**Risk:** Low (incremental with rollback at each phase)

---

## Plan Format

Each plan should include:

1. **Overview** - What and why
2. **Current Status** - What's been done
3. **Phases** - Step-by-step implementation
4. **Testing** - How to validate each phase
5. **Rollback** - How to safely revert
6. **Success Metrics** - How to measure success
7. **Timeline** - Duration estimates

Keep plans focused and actionable. Move detailed design to `docs/architecture/`.
