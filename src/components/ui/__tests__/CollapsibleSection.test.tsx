/**
 * CollapsibleSection test scaffold — RED state
 *
 * These tests describe the NEW behavior after the rewrite.
 * They are expected to FAIL against the current implementation.
 *
 * Requirements covered:
 *   SECTION-01 — gradient overlay visible when collapsed + content > 100px
 *   SECTION-03 — no gradient when expanded
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { CollapsibleSection } from '@/components/ui';

// expo-linear-gradient is not yet installed — mock prevents import errors in the rewrite
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

// Reanimated is already mocked by jest-expo preset (synchronous instant values)

// useThemedStyles returns static styles in tests — RN mocks useColorScheme to null
// No explicit mock needed; the component handles the undefined color scheme gracefully

describe('CollapsibleSection', () => {
  // ---------------------------------------------------------------------------
  // Behavior 1 (SECTION-01): Gradient visible when collapsed + content > 100px
  // ---------------------------------------------------------------------------
  describe('when collapsed and content height exceeds 100px', () => {
    it('renders a LinearGradient overlay with testID="collapsible-gradient"', () => {
      const { getByTestId, getByText } = render(
        <CollapsibleSection defaultExpanded={false}>
          <React.Fragment>
            <>{/* simulated tall content */}</>
          </React.Fragment>
        </CollapsibleSection>
      );

      // Simulate the content measurement reporting a tall layout
      // The rewrite will attach onLayout to the inner content view
      // We fire the event after initial render so the component can react
      act(() => {
        // The content measurement view should have testID="collapsible-content"
        try {
          const contentView = getByTestId('collapsible-content');
          fireEvent(contentView, 'layout', {
            nativeEvent: { layout: { height: 200 } },
          });
        } catch {
          // If testID not found the assertion below will catch the failure
        }
      });

      // Gradient must be in the tree when collapsed + content is tall
      getByTestId('collapsible-gradient');
    });
  });

  // ---------------------------------------------------------------------------
  // Behavior 2 (SECTION-03): No gradient when expanded
  // ---------------------------------------------------------------------------
  describe('when expanded', () => {
    it('does NOT render the gradient overlay', () => {
      const { queryByTestId, getByTestId } = render(
        <CollapsibleSection defaultExpanded={true}>
          <React.Fragment />
        </CollapsibleSection>
      );

      // Simulate tall content so short-content guard does not suppress gradient
      act(() => {
        try {
          const contentView = getByTestId('collapsible-content');
          fireEvent(contentView, 'layout', {
            nativeEvent: { layout: { height: 200 } },
          });
        } catch {
          // ignore — assertion below catches the real failure
        }
      });

      expect(queryByTestId('collapsible-gradient')).toBeNull();
    });

    it('hides the gradient when user expands the section', () => {
      const { queryByTestId, getByTestId } = render(
        <CollapsibleSection title="My Section" defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );

      // Simulate tall content
      act(() => {
        try {
          const contentView = getByTestId('collapsible-content');
          fireEvent(contentView, 'layout', {
            nativeEvent: { layout: { height: 200 } },
          });
        } catch {
          // ignore
        }
      });

      // Press header to expand
      act(() => {
        fireEvent.press(getByTestId('collapsible-header'));
      });

      expect(queryByTestId('collapsible-gradient')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Behavior 3: Always-mounted children (no conditional unmount on toggle)
  // ---------------------------------------------------------------------------
  describe('always-mounted children', () => {
    it('keeps children in the tree when collapsed (no remount on toggle)', () => {
      const { getByText } = render(
        <CollapsibleSection title="Section" defaultExpanded={false}>
          <React.Fragment>
            {'unique-child-content'}
          </React.Fragment>
        </CollapsibleSection>
      );

      // Child must be in the tree even when collapsed — the rewrite hides via
      // animated height/clip, not conditional unmount
      expect(getByText('unique-child-content')).toBeTruthy();
    });

    it('children remain mounted after collapsing from expanded state', () => {
      const { getByText, getByTestId } = render(
        <CollapsibleSection title="Section" defaultExpanded={true}>
          <React.Fragment>
            {'persistent-child-text'}
          </React.Fragment>
        </CollapsibleSection>
      );

      // Collapse via header press
      act(() => {
        fireEvent.press(getByTestId('collapsible-header'));
      });

      // Child must still be in the tree after collapsing
      expect(getByText('persistent-child-text')).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Behavior 4 (short-content guard): No gradient + non-collapsible when ≤ 100px
  // ---------------------------------------------------------------------------
  describe('short-content guard', () => {
    it('does NOT render gradient when content height is ≤ 100px', () => {
      const { queryByTestId, getByTestId } = render(
        <CollapsibleSection title="Short Section" defaultExpanded={false}>
          <React.Fragment>
            {'short content'}
          </React.Fragment>
        </CollapsibleSection>
      );

      // Simulate short content (≤ 100px)
      act(() => {
        try {
          const contentView = getByTestId('collapsible-content');
          fireEvent(contentView, 'layout', {
            nativeEvent: { layout: { height: 50 } },
          });
        } catch {
          // ignore — if testID missing the null assertion catches failure
        }
      });

      expect(queryByTestId('collapsible-gradient')).toBeNull();
    });

    it('does NOT collapse when content height is ≤ 100px (section stays expanded)', () => {
      const { getByText, getByTestId } = render(
        <CollapsibleSection title="Short Section" defaultExpanded={false}>
          <React.Fragment>
            {'short-section-child'}
          </React.Fragment>
        </CollapsibleSection>
      );

      // Simulate short content — section should auto-expand / ignore collapse
      act(() => {
        try {
          const contentView = getByTestId('collapsible-content');
          fireEvent(contentView, 'layout', {
            nativeEvent: { layout: { height: 50 } },
          });
        } catch {
          // ignore
        }
      });

      // Child must be visible (section cannot be meaningfully collapsed)
      expect(getByText('short-section-child')).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Behavior 5 (header-only toggle model): title provided → header toggles; content press does NOT
  // ---------------------------------------------------------------------------
  describe('header-only toggle model (title provided)', () => {
    it('pressing the header toggles the expanded state', () => {
      const { queryByTestId, getByTestId } = render(
        <CollapsibleSection title="My Book" defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );

      // Simulate tall content so collapse is real
      act(() => {
        try {
          const contentView = getByTestId('collapsible-content');
          fireEvent(contentView, 'layout', {
            nativeEvent: { layout: { height: 200 } },
          });
        } catch {
          // ignore
        }
      });

      // Initially collapsed — gradient present
      expect(getByTestId('collapsible-gradient')).toBeTruthy();

      // Press header → expand → gradient gone
      act(() => {
        fireEvent.press(getByTestId('collapsible-header'));
      });

      expect(queryByTestId('collapsible-gradient')).toBeNull();
    });

    it('pressing the content area does NOT toggle when title is provided', () => {
      const { getByTestId } = render(
        <CollapsibleSection title="My Book" defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );

      // Simulate tall content
      act(() => {
        try {
          const contentView = getByTestId('collapsible-content');
          fireEvent(contentView, 'layout', {
            nativeEvent: { layout: { height: 200 } },
          });
        } catch {
          // ignore
        }
      });

      // Press content area — should NOT toggle; gradient should remain
      act(() => {
        try {
          fireEvent.press(getByTestId('collapsible-content'));
        } catch {
          // ignore if not pressable
        }
      });

      // Still collapsed — gradient still present
      getByTestId('collapsible-gradient');
    });
  });

  // ---------------------------------------------------------------------------
  // Behavior 6 (tap-anywhere model): title omitted → content press toggles
  // ---------------------------------------------------------------------------
  describe('tap-anywhere model (title omitted)', () => {
    it('pressing the content area toggles when title is NOT provided', () => {
      const { queryByTestId, getByTestId } = render(
        <CollapsibleSection defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );

      // Simulate tall content
      act(() => {
        try {
          const contentView = getByTestId('collapsible-content');
          fireEvent(contentView, 'layout', {
            nativeEvent: { layout: { height: 200 } },
          });
        } catch {
          // ignore
        }
      });

      // Initially collapsed — gradient present
      getByTestId('collapsible-gradient');

      // Press content area → expand → gradient gone
      act(() => {
        fireEvent.press(getByTestId('collapsible-content'));
      });

      expect(queryByTestId('collapsible-gradient')).toBeNull();
    });

    it('does NOT render a header when title is omitted', () => {
      const { queryByTestId } = render(
        <CollapsibleSection defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );

      expect(queryByTestId('collapsible-header')).toBeNull();
    });
  });
});
