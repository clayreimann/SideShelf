# Error Boundaries Architecture

## Overview

The SideShelf app implements error boundaries to prevent component-level crashes from bringing down the entire application. The strategy focuses on **tab isolation**: each of the five main tabs is wrapped in its own error boundary, ensuring that an error in one tab cannot affect other tabs. When a tab encounters an error, users see a clear error message with recovery options while the rest of the app remains fully functional.

The implementation provides two error boundary components: a general-purpose `ErrorBoundary` for wrapping any component or section, and a specialized `TabErrorBoundary` designed for the tab-based navigation structure. Both integrate with the app's logger system and present user-friendly fallback UI when errors occur.

## Why Error Boundaries?

### The Problem

React component errors during rendering, lifecycle methods, or constructors will crash the entire component tree by default. In a mobile app with complex navigation, this means a single broken component can make the entire app unusable, forcing users to restart.

### The Solution

Error boundaries catch these errors at strategic points in the component tree, display fallback UI, and isolate the failure. The rest of the app continues to function normally.

### Strategic Placement

The primary error boundary strategy is **tab-level isolation**. Each tab in the bottom navigation is wrapped in a `TabErrorBoundary`, creating five isolated error zones. This aligns with user mental models: if the Library tab breaks, users expect to still access Home, Series, and other tabs.

## Implementation Strategy

### Tab Isolation Pattern

The `TabErrorBoundary` component wraps each tab's navigation stack, providing:

1. **Isolated Failure Zones**: Errors in one tab don't propagate to other tabs
2. **Automatic Reset**: When users switch to a different tab and back, the error boundary automatically clears, giving the problematic tab a fresh start
3. **User Recovery Options**: Clear paths forward via "Try Again" (reset the boundary) or "Go to Home" (navigate away from the error)
4. **Contextual Logging**: Each tab logs errors with its tab name for easier debugging

### General-Purpose Boundaries

The `ErrorBoundary` component provides flexible error catching for any component tree. It can be used to:

- Wrap potentially unstable components or features
- Isolate experimental functionality
- Protect critical UI sections
- Provide custom fallback UI for specific error scenarios

### Layered Error Handling

Error boundaries complement but don't replace existing error handling patterns:

**Error Boundaries** catch render-time errors:

- Component throws during render
- Lifecycle method failures
- Constructor errors
- Child component crashes

**Try-Catch Blocks** handle runtime errors:

- Async/await operations
- API calls and network requests
- Database queries
- Service method calls
- File system operations

This layered approach provides comprehensive coverage: boundaries catch what try-catch cannot (render errors), while try-catch handles what boundaries cannot (async operations).

## Key Features

### Automatic Tab Recovery

`TabErrorBoundary` detects when users navigate away from a tab (via child component changes) and automatically resets the error state. This means if a tab crashes, users can simply switch to another tab and return to get a fresh, working version.

### Development vs Production

Error boundaries show detailed error information (error messages and component stack traces) in development mode but hide these details in production. Production users see only friendly error messages and recovery actions.

### Navigation Integration

The error UI integrates with Expo Router to provide safe navigation even when components are in an error state. The "Go to Home" action uses the router to navigate away from broken screens.

## When to Add Error Boundaries

**Always wrap**:

- Tab navigation stacks
- Modals or overlays that could crash
- Features with external dependencies (APIs, services)
- Complex list renderers processing user data

**Consider wrapping**:

- Experimental or newly developed features
- Third-party component integrations
- Components that frequently change
- Sections with complex state logic

**Don't wrap**:

- Simple presentational components
- Static content
- Already-wrapped child components (avoid double-wrapping)
- Provider components (handle errors in the provider itself)

## Design Principles

1. **Fail Gracefully**: Never show users a blank screen or crash the app
2. **Provide Recovery**: Always give users a path forward (retry, navigate away)
3. **Isolate Failures**: Contain errors to the smallest reasonable scope
4. **Surface in Development**: Show developers full error details for debugging
5. **Hide in Production**: Present clean, non-technical error messages to users
6. **Log Everything**: Integrate with existing logging infrastructure for diagnostics

## Future Considerations

As the app evolves, additional error boundaries could be strategically placed around:

- Individual list items in large data sets (isolate single item failures)
- The audio player UI (prevent playback errors from affecting navigation)
- Settings screens (isolate configuration errors)
- Deep-linked screens (handle malformed deep link errors gracefully)

The goal remains constant: keep the app functional even when individual components fail, and always provide users with clear paths to recovery.
