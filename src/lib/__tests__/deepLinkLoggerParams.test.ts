/**
 * Tests for the logger deep-link query parser.
 *
 * Covers Brief D: `side-shelf://logger?...` deep links can flip on verbose
 * logging tags (including "api:fetch:detailed", which logs full request/
 * response bodies) with no user confirmation. This module is the pure,
 * testable core of that parsing so src/app/_layout.tsx can build a
 * confirmation dialog from it before applying anything — see that file's
 * "Handle logger configuration deep links" branch.
 */

import { describe, expect, it } from "@jest/globals";
import {
  describeLoggerDeepLinkParams,
  hasLoggerDeepLinkChanges,
  parseLoggerDeepLinkParams,
} from "@/lib/deepLinkLoggerParams";

describe("parseLoggerDeepLinkParams", () => {
  it("parses a single level[TAG]=value param", () => {
    const result = parseLoggerDeepLinkParams("side-shelf://logger?level[PlayerService]=debug");

    expect(result.tagLevels).toEqual({ PlayerService: "debug" });
    expect(result.tagEnabled).toEqual({});
  });

  it("parses a single enabled[TAG]=false param", () => {
    const result = parseLoggerDeepLinkParams(
      "side-shelf://logger?enabled[api:fetch:detailed]=false"
    );

    expect(result.tagEnabled).toEqual({ "api:fetch:detailed": false });
    expect(result.tagLevels).toEqual({});
  });

  it("treats enabled[TAG]=true (and any value other than literal 'false') as enabling the tag", () => {
    const result = parseLoggerDeepLinkParams(
      "side-shelf://logger?enabled[TagA]=true&enabled[TagB]=yes"
    );

    expect(result.tagEnabled).toEqual({ TagA: true, TagB: true });
  });

  it("parses multiple level and enabled params together, matching the attack-chain shape from the brief", () => {
    const result = parseLoggerDeepLinkParams(
      "side-shelf://logger?enabled[api:fetch:detailed]=true&level[api:fetch:detailed]=debug"
    );

    expect(result.tagEnabled).toEqual({ "api:fetch:detailed": true });
    expect(result.tagLevels).toEqual({ "api:fetch:detailed": "debug" });
  });

  it("is case-insensitive for level values", () => {
    const result = parseLoggerDeepLinkParams("side-shelf://logger?level[Tag]=WARN");

    expect(result.tagLevels).toEqual({ Tag: "warn" });
  });

  it("drops invalid level values instead of applying them", () => {
    const result = parseLoggerDeepLinkParams("side-shelf://logger?level[Tag]=verbose");

    expect(result.tagLevels).toEqual({});
  });

  it("decodes URI-encoded tag names (e.g. a colon-containing tag)", () => {
    const result = parseLoggerDeepLinkParams(
      `side-shelf://logger?enabled[${encodeURIComponent("api:fetch:detailed")}]=false`
    );

    expect(result.tagEnabled).toEqual({ "api:fetch:detailed": false });
  });

  it("ignores unrelated query params", () => {
    const result = parseLoggerDeepLinkParams("side-shelf://logger?foo=bar&level[Tag]=info");

    expect(result.tagLevels).toEqual({ Tag: "info" });
    expect(result.tagEnabled).toEqual({});
  });

  it("returns empty results for a logger deep link with no recognized params", () => {
    const result = parseLoggerDeepLinkParams("side-shelf://logger?foo=bar");

    expect(result.tagLevels).toEqual({});
    expect(result.tagEnabled).toEqual({});
  });
});

describe("hasLoggerDeepLinkChanges", () => {
  it("returns false when both maps are empty", () => {
    expect(hasLoggerDeepLinkChanges({ tagLevels: {}, tagEnabled: {} })).toBe(false);
  });

  it("returns true when tagLevels has an entry", () => {
    expect(hasLoggerDeepLinkChanges({ tagLevels: { Tag: "debug" }, tagEnabled: {} })).toBe(true);
  });

  it("returns true when tagEnabled has an entry", () => {
    expect(hasLoggerDeepLinkChanges({ tagLevels: {}, tagEnabled: { Tag: true } })).toBe(true);
  });
});

describe("describeLoggerDeepLinkParams", () => {
  it("describes a level change", () => {
    const lines = describeLoggerDeepLinkParams({
      tagLevels: { PlayerService: "debug" },
      tagEnabled: {},
    });

    expect(lines).toEqual(['Set log level for "PlayerService" to debug']);
  });

  it("describes an enable and a disable change", () => {
    const lines = describeLoggerDeepLinkParams({
      tagLevels: {},
      tagEnabled: { "api:fetch:detailed": true, PlayerService: false },
    });

    expect(lines).toEqual([
      'Enable logging for "api:fetch:detailed"',
      'Disable logging for "PlayerService"',
    ]);
  });

  it("returns an empty list when there are no changes", () => {
    expect(describeLoggerDeepLinkParams({ tagLevels: {}, tagEnabled: {} })).toEqual([]);
  });
});
