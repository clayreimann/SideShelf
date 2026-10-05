# Implementation Plans

This directory contains focused, actionable implementation plans for major features and refactorings.

## Active Plans

### [UI Testing](./ui-testing.md)

Phased plan to evolve the Maestro screenshot automation into a full E2E regression suite, covering deep links, self-contained login, testID conventions, flow decomposition, and CI integration.

**Status:** Phase 0 complete (screenshots working); Phase 1–5 pending
**Timeline:** 2–3 weeks total
**Risk:** Low (all phases additive, full rollback at each step)

---

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
