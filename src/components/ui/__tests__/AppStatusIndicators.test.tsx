import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import AppStatusIndicators from "@/components/ui/AppStatusIndicators";

const mockPush = jest.fn();
const mockUseAuth = jest.fn();
const mockUseNetwork = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("@/stores", () => ({
  useNetwork: () => mockUseNetwork(),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 0, left: 0 }),
}));

describe("AppStatusIndicators", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ authStatus: "authenticated" });
    mockUseNetwork.mockReturnValue({
      initialized: true,
      isConnected: true,
      isInternetReachable: true,
      serverReachable: true,
    });
  });

  it("renders nothing when the session and network are healthy", () => {
    const { queryByTestId } = render(<AppStatusIndicators />);

    expect(queryByTestId("app-status-indicators")).toBeNull();
  });

  it("opens reauthentication as a voluntary modal action", () => {
    mockUseAuth.mockReturnValue({ authStatus: "reauthRequired" });
    const { getByTestId, getByText } = render(<AppStatusIndicators />);

    expect(getByText("Session expired")).toBeTruthy();
    fireEvent.press(getByTestId("reauthenticate-button"));

    expect(mockPush).toHaveBeenCalledWith({ pathname: "/login", params: { mode: "reauth" } });
  });

  it("shows the existing offline status without a reauthentication action", () => {
    mockUseNetwork.mockReturnValue({
      initialized: true,
      isConnected: false,
      isInternetReachable: false,
      serverReachable: false,
    });
    const { getByText, queryByTestId } = render(<AppStatusIndicators />);

    expect(getByText("Server unreachable - Some features may be unavailable")).toBeTruthy();
    expect(queryByTestId("reauthenticate-button")).toBeNull();
  });

  it("stacks offline and expired states under one safe-area container", () => {
    mockUseAuth.mockReturnValue({ authStatus: "reauthRequired" });
    mockUseNetwork.mockReturnValue({
      initialized: true,
      isConnected: true,
      isInternetReachable: true,
      serverReachable: false,
    });
    const { getByTestId, getByText } = render(<AppStatusIndicators />);

    expect(getByText("Session expired")).toBeTruthy();
    expect(getByText("Server unreachable - Some features may be unavailable")).toBeTruthy();
    expect(getByTestId("app-status-indicators")).toHaveStyle({ paddingTop: 24 });
  });
});
