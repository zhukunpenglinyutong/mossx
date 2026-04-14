import { describe, expect, it } from "vitest";
import {
  areFileUrisEquivalent,
  relativePathFromFileUri,
  toFileUri,
} from "./fileViewNavigationUtils";

describe("fileViewNavigationUtils", () => {
  it("builds Windows file URIs that round-trip to workspace-relative paths", () => {
    const fileUri = toFileUri("C:\\Repo\\src\\Main.ts");

    expect(fileUri).toBe("file:///C:/Repo/src/Main.ts");
    expect(relativePathFromFileUri(fileUri, "C:/Repo")).toBe("src/Main.ts");
  });

  it("builds UNC file URIs that preserve the network host", () => {
    const fileUri = toFileUri("\\\\server\\share\\Repo\\src\\Main.ts");

    expect(fileUri).toBe("file://server/share/Repo/src/Main.ts");
    expect(relativePathFromFileUri(fileUri, "//server/share/Repo")).toBe("src/Main.ts");
  });

  it("compares Windows file URIs case-insensitively when requested", () => {
    expect(
      areFileUrisEquivalent(
        "file:///C:/Repo/src/Main.ts",
        "file:///c:/repo/src/main.ts",
        true,
      ),
    ).toBe(true);
  });
});
