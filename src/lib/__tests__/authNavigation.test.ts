import { getPostLoginNavigation, shouldRedirectToLogin } from "@/lib/authNavigation";

describe("auth navigation policy", () => {
  it("blocks the tabs only for a signed-out session", () => {
    expect(shouldRedirectToLogin("signedOut")).toBe(true);
    expect(shouldRedirectToLogin("initializing")).toBe(false);
    expect(shouldRedirectToLogin("authenticated")).toBe(false);
    expect(shouldRedirectToLogin("reauthRequired")).toBe(false);
  });

  it("dismisses reauthentication login but replaces the root after ordinary login", () => {
    expect(getPostLoginNavigation("reauth")).toBe("dismiss");
    expect(getPostLoginNavigation(undefined)).toBe("replaceRoot");
    expect(getPostLoginNavigation("unexpected")).toBe("replaceRoot");
  });
});
