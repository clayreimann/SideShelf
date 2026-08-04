import { render } from "@testing-library/react-native";
import { GridItem, ListItem } from "@/components/library/LibraryItem";
import type { LibraryItemDisplayRow } from "@/types/database";

jest.mock("@/lib/theme", () => ({
  useThemedStyles: jest.fn(() => ({
    isDark: false,
    colors: {
      textPrimary: "#000",
      textSecondary: "#333",
      background: "#fff",
      coverBackground: "#eee",
    },
  })),
}));

let mockHref: string | undefined;
let mockPathname = "/library";

jest.mock("expo-router", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => {
    mockHref = href;
    return children;
  },
  usePathname: () => mockPathname,
}));

const mockIsItemDownloaded = jest.fn();
const mockIsItemPartiallyDownloaded = jest.fn();

jest.mock("@/stores", () => ({
  useDownloads: () => ({
    isItemDownloaded: mockIsItemDownloaded,
    isItemPartiallyDownloaded: mockIsItemPartiallyDownloaded,
  }),
  useNetwork: () => ({
    isConnected: true,
    isInternetReachable: true,
  }),
}));

const baseItem: LibraryItemDisplayRow = {
  id: "item-1",
  title: "The Hobbit",
  author: "J.R.R. Tolkien",
  narrator: "Rob Inglis",
  coverUri: null,
  publishedYear: "1937",
  duration: 3600,
} as LibraryItemDisplayRow;

describe("LibraryItem accessibility", () => {
  beforeEach(() => {
    mockIsItemDownloaded.mockReset();
    mockIsItemPartiallyDownloaded.mockReset();
    mockHref = undefined;
    mockPathname = "/library";
  });

  it.each([
    ["/library", "/library/item-1"],
    ["/more/library", "/more/library/item-1"],
  ])("GridItem links to the item route for %s", (pathname, expected) => {
    mockPathname = pathname;
    render(<GridItem item={baseItem} />);
    expect(mockHref).toBe(expected);
  });

  it("GridItem exposes a button-role element labeled with title and author", () => {
    mockIsItemDownloaded.mockReturnValue(false);
    mockIsItemPartiallyDownloaded.mockReturnValue(false);

    const { getByRole } = render(<GridItem item={baseItem} />);
    const button = getByRole("button");
    expect(button.props.accessibilityLabel).toContain("The Hobbit");
    expect(button.props.accessibilityLabel).toContain("J.R.R. Tolkien");
  });

  it("GridItem includes downloaded state in the label when downloaded", () => {
    mockIsItemDownloaded.mockReturnValue(true);
    mockIsItemPartiallyDownloaded.mockReturnValue(false);

    const { getByRole } = render(<GridItem item={baseItem} />);
    const button = getByRole("button");
    expect(button.props.accessibilityLabel).toContain("downloaded");
  });

  it("ListItem exposes a button-role element labeled with title and author", () => {
    mockIsItemDownloaded.mockReturnValue(false);
    mockIsItemPartiallyDownloaded.mockReturnValue(false);

    const { getByRole } = render(<ListItem item={baseItem} />);
    const button = getByRole("button");
    expect(button.props.accessibilityLabel).toContain("The Hobbit");
    expect(button.props.accessibilityLabel).toContain("J.R.R. Tolkien");
  });

  it("ListItem includes downloaded state in the label when downloaded", () => {
    mockIsItemDownloaded.mockReturnValue(true);
    mockIsItemPartiallyDownloaded.mockReturnValue(false);

    const { getByRole } = render(<ListItem item={baseItem} />);
    const button = getByRole("button");
    expect(button.props.accessibilityLabel).toContain("downloaded");
  });
});
