import { describe, expect, it } from "vitest";
import { errorResult, successResult } from "../src/lib/results.js";
import { parseToolTextContent } from "./test-helpers.js";

describe("tool result helpers", () => {
  it("formats a successful result as text content", () => {
    const result = successResult({ ok: true, value: 123 });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(parseToolTextContent(result)).toEqual({ ok: true, value: 123 });
  });

  it("formats an error result with isError flag", () => {
    const result = errorResult(new Error("broken"));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("broken");
  });

  it("formats non-error values via string coercion", () => {
    const result = errorResult("bad input");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("bad input");
  });
});
