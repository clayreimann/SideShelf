# Player Architecture Documentation

Documentation for the SideShelf player system and state machine coordinator.

---

## Current Status

✅ **Phase 1 Complete** - State machine coordinator running in observer mode

**Next:** Validate in production for 1-2 weeks, then proceed to Phase 2

---

## Documentation

### [Player State Machine](./player-state-machine.md)

Complete architecture for the event-driven state machine coordinator:

- **Problem:** Race conditions, position drift, multiple sources of truth
- **Solution:** Central coordinator with finite state machine and serial event processing
- **Benefits:** Eliminates races, single source of truth, explicit transitions
- **Status:** Phase 1 complete, monitoring in production
- **Design Decisions:** Event bus pattern, serial processing, observer mode deployment

### [AsyncStorage Organization](./async-storage-organization.md)

Conventions for AsyncStorage key namespacing (unrelated to state machine).

---

## Implementation

**Phase 1 Complete:**
- `src/types/coordinator.ts` - Type definitions
- `src/services/coordinator/eventBus.ts` - Event bus implementation
- `src/services/coordinator/transitions.ts` - State transition matrix
- `src/services/coordinator/PlayerStateCoordinator.ts` - Main coordinator
- `src/services/coordinator/__tests__/` - Test suite (100 tests, 90%+ coverage)

**Next Phases:**

See [State Machine Migration Plan](../plans/state-machine-migration.md) for phases 2-5 roadmap.

---

## Quick Reference

**Current Player Components:**
- `PlayerService` - UI commands and orchestration
- `PlayerBackgroundService` - Native player event handling
- `ProgressService` - Database persistence and server sync
- `playerSlice` - Zustand store for UI state

**Coordinator Components (Phase 1):**
- Event Bus - Decouples event dispatching
- State Machine - Validates transitions
- Event Queue - Serial processing
- Diagnostics - Track Player debug screen

**Run Tests:**
```bash
npm test -- coordinator
npm run test:coverage -- coordinator
```

**Coverage:** 100% (eventBus), 100% (transitions), 90% (coordinator)

---

**Last Updated:** 2025-11-17
