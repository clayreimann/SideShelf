import CoverItem from "@/components/home/CoverItem";
import type { HomeScreenItem } from "@/db/helpers/homeScreen";
import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockPathname = "/home";

jest.mock("expo-router", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/theme", () => ({
  useThemedStyles: () => ({
    styles: { text: {} },
    colors: { coverBackground: "#eee" },
  }),
}));

jest.mock("@/components/ui/CoverImage", () => () => null);

const homeItem: HomeScreenItem = {
  id: "book-1",
  title: "The Hobbit",
  authorName: "J.R.R. Tolkien",
  progress: 0,
};

describe("CoverItem navigation", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockPathname = "/home";
  });

  it.each([
    ["/home", "/home/item/book-1"],
    ["/more/home", "/more/home/item/book-1"],
  ])("pushes the book route for %s", (pathname, expected) => {
    mockPathname = pathname;
    const { getByRole } = render(<CoverItem item={homeItem} />);

    fireEvent.press(getByRole("button"));

    expect(mockPush).toHaveBeenCalledWith(expected);
  });
});
