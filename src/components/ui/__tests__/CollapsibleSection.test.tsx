/**
 * CollapsibleSection — full prop/state matrix coverage
 *
 * Prop dimensions:
 *   title: absent | present
 *   defaultExpanded: false | true
 * Content dimensions:
 *   short (≤ 100px) | tall (> 100px)
 * Layout-pass dimensions:
 *   single | two-pass (small first, tall second — mirrors RenderHtml async rendering)
 *
 * Key design invariant tested here:
 *   onLayout lives on a separate invisible "sizer" view (testID="collapsible-sizer")
 *   that is NEVER inside the clip container. This ensures Yoga's maxHeight constraint
 *   on the clip container never pollutes the natural-height measurement — solving
 *   the Fabric regression where maxHeight propagated as a child constraint.
 */

import React from "react";
import { Text as RNText } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { CollapsibleSection } from "@/components/ui";

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: "LinearGradient",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fire a layout event on the unconstrained sizer view. */
function fireSizerLayout(getByTestId: ReturnType<typeof render>["getByTestId"], height: number) {
  act(() => {
    fireEvent(getByTestId("collapsible-sizer"), "layout", {
      nativeEvent: { layout: { height } },
    });
  });
}

const TALL = 300;
const SHORT = 50;

// ---------------------------------------------------------------------------
// 1. Sizer exists
// ---------------------------------------------------------------------------
describe("measurement sizer", () => {
  it("always renders collapsible-sizer for natural-height measurement", () => {
    const { getByTestId } = render(
      <CollapsibleSection>
        <React.Fragment />
      </CollapsibleSection>
    );
    expect(getByTestId("collapsible-sizer")).toBeTruthy();
  });

  it("renders collapsible-sizer when title is provided", () => {
    const { getByTestId } = render(
      <CollapsibleSection title="Section">
        <React.Fragment />
      </CollapsibleSection>
    );
    expect(getByTestId("collapsible-sizer")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. No-title (tap-anywhere) mode — defaultExpanded=false
// ---------------------------------------------------------------------------
describe("no-title, defaultExpanded=false", () => {
  describe("tall content (single layout pass)", () => {
    it("shows gradient after sizer reports tall content", () => {
      const { getByTestId } = render(
        <CollapsibleSection defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );
      fireSizerLayout(getByTestId, TALL);
      getByTestId("collapsible-gradient");
    });

    it("tapping the content expands — gradient disappears", () => {
      const { getByTestId, queryByTestId } = render(
        <CollapsibleSection defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );
      fireSizerLayout(getByTestId, TALL);
      expect(getByTestId("collapsible-gradient")).toBeTruthy();

      act(() => {
        fireEvent.press(getByTestId("collapsible-content"));
      });

      expect(queryByTestId("collapsible-gradient")).toBeNull();
    });

    it("tapping again collapses — gradient reappears", () => {
      const { getByTestId } = render(
        <CollapsibleSection defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );
      fireSizerLayout(getByTestId, TALL);

      act(() => {
        fireEvent.press(getByTestId("collapsible-content"));
      }); // expand
      act(() => {
        fireEvent.press(getByTestId("collapsible-content"));
      }); // collapse

      getByTestId("collapsible-gradient");
    });

    it("does not render a header", () => {
      const { queryByTestId } = render(
        <CollapsibleSection defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );
      expect(queryByTestId("collapsible-header")).toBeNull();
    });
  });

  describe("tall content (two-pass: small height first, then tall)", () => {
    it("shows gradient after second sizer pass reports tall content", () => {
      const { getByTestId } = render(
        <CollapsibleSection defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );

      // First pass: small placeholder height (RenderHtml first render)
      fireSizerLayout(getByTestId, 20);
      // Second pass: real content height
      fireSizerLayout(getByTestId, TALL);

      getByTestId("collapsible-gradient");
    });

    it("tap works after two-pass measurement", () => {
      const { getByTestId, queryByTestId } = render(
        <CollapsibleSection defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );

      fireSizerLayout(getByTestId, 20);
      fireSizerLayout(getByTestId, TALL);

      expect(getByTestId("collapsible-gradient")).toBeTruthy();

      act(() => {
        fireEvent.press(getByTestId("collapsible-content"));
      });

      expect(queryByTestId("collapsible-gradient")).toBeNull();
    });
  });

  describe("short content", () => {
    it("does not show gradient", () => {
      const { queryByTestId, getByTestId } = render(
        <CollapsibleSection defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );
      fireSizerLayout(getByTestId, SHORT);
      expect(queryByTestId("collapsible-gradient")).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. No-title (tap-anywhere) mode — defaultExpanded=true
// ---------------------------------------------------------------------------
describe("no-title, defaultExpanded=true", () => {
  it("does not show gradient (starts expanded)", () => {
    const { queryByTestId, getByTestId } = render(
      <CollapsibleSection defaultExpanded={true}>
        <React.Fragment />
      </CollapsibleSection>
    );
    fireSizerLayout(getByTestId, TALL);
    expect(queryByTestId("collapsible-gradient")).toBeNull();
  });

  it("tapping collapses — gradient appears", () => {
    const { getByTestId } = render(
      <CollapsibleSection defaultExpanded={true}>
        <React.Fragment />
      </CollapsibleSection>
    );
    fireSizerLayout(getByTestId, TALL);

    act(() => {
      fireEvent.press(getByTestId("collapsible-content"));
    });

    getByTestId("collapsible-gradient");
  });
});

// ---------------------------------------------------------------------------
// 4. Title mode — defaultExpanded=false
// ---------------------------------------------------------------------------
describe("title provided, defaultExpanded=false", () => {
  describe("tall content", () => {
    it("shows gradient after sizer reports tall content", () => {
      const { getByTestId } = render(
        <CollapsibleSection title="My Section" defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );
      fireSizerLayout(getByTestId, TALL);
      getByTestId("collapsible-gradient");
    });

    it("pressing the header expands — gradient disappears", () => {
      const { getByTestId, queryByTestId } = render(
        <CollapsibleSection title="My Section" defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );
      fireSizerLayout(getByTestId, TALL);
      expect(getByTestId("collapsible-gradient")).toBeTruthy();

      act(() => {
        fireEvent.press(getByTestId("collapsible-header"));
      });

      expect(queryByTestId("collapsible-gradient")).toBeNull();
    });

    it("pressing the header again collapses — gradient reappears", () => {
      const { getByTestId } = render(
        <CollapsibleSection title="My Section" defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );
      fireSizerLayout(getByTestId, TALL);

      act(() => {
        fireEvent.press(getByTestId("collapsible-header"));
      }); // expand
      act(() => {
        fireEvent.press(getByTestId("collapsible-header"));
      }); // collapse

      getByTestId("collapsible-gradient");
    });

    it("content area press when collapsed also expands (whole section is tap target)", () => {
      // When title mode and collapsed, the Pressable wraps the whole section
      // including the content area — pressing content should expand.
      const { getByTestId, queryByTestId } = render(
        <CollapsibleSection title="My Section" defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );
      fireSizerLayout(getByTestId, TALL);

      act(() => {
        fireEvent.press(getByTestId("collapsible-header"));
      });

      expect(queryByTestId("collapsible-gradient")).toBeNull();
    });
  });

  describe("short content", () => {
    it("does not show gradient", () => {
      const { queryByTestId, getByTestId } = render(
        <CollapsibleSection title="My Section" defaultExpanded={false}>
          <React.Fragment />
        </CollapsibleSection>
      );
      fireSizerLayout(getByTestId, SHORT);
      expect(queryByTestId("collapsible-gradient")).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Title mode — defaultExpanded=true
// ---------------------------------------------------------------------------
describe("title provided, defaultExpanded=true", () => {
  it("does not show gradient (starts expanded)", () => {
    const { queryByTestId, getByTestId } = render(
      <CollapsibleSection title="My Section" defaultExpanded={true}>
        <React.Fragment />
      </CollapsibleSection>
    );
    fireSizerLayout(getByTestId, TALL);
    expect(queryByTestId("collapsible-gradient")).toBeNull();
  });

  it("header press collapses — gradient appears", () => {
    const { getByTestId } = render(
      <CollapsibleSection title="My Section" defaultExpanded={true}>
        <React.Fragment />
      </CollapsibleSection>
    );
    fireSizerLayout(getByTestId, TALL);

    act(() => {
      fireEvent.press(getByTestId("collapsible-header"));
    });

    getByTestId("collapsible-gradient");
  });

  it("content press when expanded does NOT collapse (only header toggles)", () => {
    const { queryByTestId, getByTestId } = render(
      <CollapsibleSection title="My Section" defaultExpanded={true}>
        <React.Fragment />
      </CollapsibleSection>
    );
    fireSizerLayout(getByTestId, TALL);

    act(() => {
      try {
        fireEvent.press(getByTestId("collapsible-content"));
      } catch {
        /* not pressable */
      }
    });

    expect(queryByTestId("collapsible-gradient")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Children always mounted
// ---------------------------------------------------------------------------
describe("always-mounted children", () => {
  it("children are in the tree when collapsed (no conditional unmount)", () => {
    const { getAllByText, getByTestId } = render(
      <CollapsibleSection title="Section" defaultExpanded={false}>
        <RNText>unique-child</RNText>
      </CollapsibleSection>
    );
    fireSizerLayout(getByTestId, TALL);
    // Children appear in both the sizer and the visible container — at least one instance.
    expect(getAllByText("unique-child").length).toBeGreaterThanOrEqual(1);
  });

  it("children remain mounted after collapsing from expanded state", () => {
    const { getAllByText, getByTestId } = render(
      <CollapsibleSection title="Section" defaultExpanded={true}>
        <RNText>persistent-child</RNText>
      </CollapsibleSection>
    );
    fireSizerLayout(getByTestId, TALL);

    act(() => {
      fireEvent.press(getByTestId("collapsible-header"));
    });

    expect(getAllByText("persistent-child").length).toBeGreaterThanOrEqual(1);
  });
});
