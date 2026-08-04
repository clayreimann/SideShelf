import { fireEvent, render } from "@testing-library/react-native";
import MoreScreen from "@/app/(tabs)/more/index";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockLogout = jest.fn();

const mockState = {
  logger: {
    errorCount: 0,
    errorsAcknowledgedTimestamp: null,
  },
  settings: {
    diagnosticsEnabled: false,
    tabOrder: ["home", "library", "series", "authors"],
    hiddenTabs: ["home", "library", "series", "authors"],
  },
};

jest.mock("@/hooks/useFloatingPlayerPadding", () => ({
  useFloatingPlayerPadding: () => ({}),
}));

jest.mock("@/lib/theme", () => ({
  useThemedStyles: () => ({
    isDark: false,
    styles: {
      flatListContainer: {},
      listItem: {},
      text: {},
    },
  }),
}));

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

jest.mock("@/stores/appStore", () => ({
  useAppStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));

jest.mock("expo-symbols", () => ({
  SymbolView: () => null,
}));

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(),
}));

describe("MoreScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes every hidden movable tab through its More index", () => {
    const { getByLabelText } = render(<MoreScreen />);

    fireEvent.press(getByLabelText("Home"));
    fireEvent.press(getByLabelText("Library"));
    fireEvent.press(getByLabelText("Series"));
    fireEvent.press(getByLabelText("Authors"));

    expect(mockPush.mock.calls).toEqual([
      ["/more/home"],
      ["/more/library"],
      ["/more/series"],
      ["/more/authors"],
    ]);
  });
});
