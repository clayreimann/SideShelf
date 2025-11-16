# Coordinator Tests

Comprehensive unit tests for the PlayerStateCoordinator, event bus, and state machine transitions.

## Test Files

### 1. `eventBus.test.ts` (56 tests)

Tests the PlayerEventBus event dispatching system.

**Coverage:**
- Event dispatching to listeners
- Subscription and unsubscription
- Event history tracking
- Async listener support
- Error handling
- Performance with many subscribers
- Edge cases (rapid events, listener errors, etc.)

**Key Test Scenarios:**
- ✅ Dispatch to multiple listeners
- ✅ Async listeners don't block
- ✅ Listener errors don't crash bus
- ✅ Event history maintains 100 event limit
- ✅ Unsubscribe works correctly
- ✅ Handles 100 subscribers efficiently (<100ms)

### 2. `transitions.test.ts` (47 tests)

Tests the state machine transition matrix and validation.

**Coverage:**
- Transition matrix completeness
- State transition validation
- Allowed/disallowed transitions
- No-op event handling
- Complete playback flows
- Error recovery flows
- Edge cases

**Key Test Scenarios:**
- ✅ All states have defined transitions
- ✅ Valid transitions are allowed
- ✅ Invalid transitions are rejected
- ✅ Complete playback flow (IDLE → LOADING → READY → PLAYING → PAUSED → STOPPING → IDLE)
- ✅ Error recovery flow (ERROR → PLAYING/LOADING/IDLE)
- ✅ Seeking flow (PLAYING → SEEKING → READY)
- ✅ Buffering flow (PLAYING → BUFFERING → PLAYING)

### 3. `PlayerStateCoordinator.test.ts` (37 tests)

Tests the main PlayerStateCoordinator class.

**Coverage:**
- Singleton pattern
- Event dispatching and queuing
- State transition validation
- Metrics collection
- Event bus integration
- Observer mode behavior
- Error handling
- Performance

**Key Test Scenarios:**
- ✅ Singleton instance works correctly
- ✅ Events are processed serially (no race conditions)
- ✅ Valid transitions are processed
- ✅ Invalid transitions are rejected
- ✅ Metrics are tracked accurately
- ✅ Event queue works correctly
- ✅ Subscribes to event bus
- ✅ Observer mode doesn't execute actions
- ✅ Error handling is graceful
- ✅ Average processing time < 10ms

## Running Tests

### Run all coordinator tests
```bash
npm test -- coordinator
```

### Run specific test file
```bash
npm test -- eventBus.test.ts
npm test -- transitions.test.ts
npm test -- PlayerStateCoordinator.test.ts
```

### Run with coverage
```bash
npm run test:coverage -- coordinator
```

### Watch mode
```bash
npm run test:watch -- coordinator
```

## Test Coverage Goals

| Module | Lines | Functions | Branches | Statements |
|--------|-------|-----------|----------|------------|
| eventBus.ts | >95% | 100% | >90% | >95% |
| transitions.ts | 100% | 100% | 100% | 100% |
| PlayerStateCoordinator.ts | >90% | >90% | >85% | >90% |

## Test Organization

### Event Bus Tests

```
eventBus.test.ts
├─ dispatch
│  ├─ Basic dispatching
│  ├─ Payload handling
│  ├─ Async listeners
│  ├─ Error handling
│  └─ Event history
├─ subscribe
│  ├─ Add listener
│  ├─ Unsubscribe
│  └─ Multiple subscribers
├─ Performance
│  └─ Many subscribers
└─ Edge cases
   ├─ Rapid events
   ├─ Self-unsubscribe
   └─ Async errors
```

### Transitions Tests

```
transitions.test.ts
├─ transitions matrix
│  ├─ Completeness
│  └─ Each state definition
├─ Validation functions
│  ├─ isTransitionAllowed
│  ├─ getNextState
│  ├─ isNoOpEvent
│  ├─ getAllowedEvents
│  └─ validateTransition
├─ Playback flows
│  ├─ Complete playback flow
│  ├─ Error recovery
│  ├─ Seeking
│  └─ Buffering
└─ Edge cases
   ├─ Invalid transitions
   └─ State-specific rules
```

### Coordinator Tests

```
PlayerStateCoordinator.test.ts
├─ getInstance (singleton)
├─ dispatch
│  ├─ Event queuing
│  ├─ Serial processing
│  └─ Error handling
├─ State transitions
│  ├─ Valid transitions
│  ├─ Invalid transitions
│  └─ No-op events
├─ Metrics
│  ├─ Event counting
│  ├─ Processing time
│  └─ Queue length
├─ Context & diagnostics
│  ├─ getContext
│  ├─ getEventQueue
│  └─ exportDiagnostics
├─ Event bus integration
├─ Observer mode
├─ Event emitters
└─ Performance
```

## Mocking Strategy

### What We Mock
- `@/lib/logger` - Prevents console spam in tests

### What We Don't Mock
- Event bus - Real implementation tested
- Transitions - Real implementation tested
- Coordinator internals - Real implementation tested

This ensures we're testing real behavior, not mocks.

## Common Test Patterns

### Testing async event processing
```typescript
it('should process event', async () => {
  await coordinator.dispatch({ type: 'PLAY' });

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 50));

  const metrics = coordinator.getMetrics();
  expect(metrics.totalEventsProcessed).toBe(1);
});
```

### Testing event emissions
```typescript
it('should emit diagnostic event', async () => {
  const handler = jest.fn();
  coordinator.on('diagnostic', handler);

  await coordinator.dispatch({ type: 'PLAY' });
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(handler).toHaveBeenCalled();
});
```

### Testing state transitions
```typescript
it('should transition correctly', () => {
  const result = validateTransition(PlayerState.READY, { type: 'PLAY' });

  expect(result.allowed).toBe(true);
  expect(result.nextState).toBe(PlayerState.PLAYING);
});
```

## Performance Benchmarks

Tests validate these performance targets:

- **Event processing**: < 10ms average
- **Event dispatching**: < 100ms for 100 subscribers
- **Event queue**: Processes 100 events < 1 second
- **State validation**: < 1ms per validation

## Edge Cases Tested

### Event Bus
- Listener throws error → Other listeners still called
- Async listener throws → Doesn't crash bus
- Listener unsubscribes during event → Handled gracefully
- Rapid event dispatching → All processed
- 150 events → History limited to 100

### Transitions
- Invalid transitions → Rejected with reason
- No-op events → Allowed without state change
- Error recovery → Multiple paths available
- Circular flows → Supported (e.g., PLAYING → PAUSED → PLAYING)

### Coordinator
- Multiple rapid dispatches → Processed serially
- Error during processing → Continues processing next event
- Observer mode → Logs but doesn't execute
- Reset instance → Clean state

## Debugging Failed Tests

### Test times out
- Increase timeout in test
- Check for missing `await` on promises
- Verify event processing completes

### Unexpected metric values
- Check timing (events may still be processing)
- Add longer wait time before checking metrics
- Verify event queue is empty

### Mock not working
- Check mock is before imports
- Use `jest.clearAllMocks()` in `beforeEach`
- Verify mock path is correct

## Adding New Tests

When adding new coordinator functionality:

1. **Add unit tests** for the new feature
2. **Test edge cases** (errors, invalid input, etc.)
3. **Test performance** if relevant
4. **Update this README** with new test coverage

Example:
```typescript
describe('new feature', () => {
  it('should handle normal case', () => {
    // Test implementation
  });

  it('should handle error case', () => {
    // Test error handling
  });

  it('should perform efficiently', () => {
    // Test performance
  });
});
```

## CI/CD Integration

These tests run automatically on:
- Every commit (pre-commit hook)
- Every pull request
- Before deployment

**All tests must pass** before merging to main branch.

---

**Total Test Count**: 140 tests
**Estimated Run Time**: < 5 seconds
**Coverage Target**: > 90%
