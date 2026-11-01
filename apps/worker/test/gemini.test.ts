import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GeminiLLMClient, geminiModel } from "../src/llm/gemini";

afterEach(() => vi.unstubAllGlobals());

const reply = (text: string, extra: object = {}) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      ...extra,
    }),
    { status: 200 },
  );

describe("gemini adapter", () => {
  it("falls back from a Claude model name to the free Gemini default", () => {
    expect(geminiModel("claude-sonnet-5-5")).toBe("gemini-2.5-flash");
    expect(geminiModel("gemini-2.5-flash-lite")).toBe("gemini-2.5-flash-lite");
  });

  it("parses a valid answer, sends the key in a header and reports zero cost", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeminiLLMClient("k", "gemini-2.5-flash", "gemini-2.5-flash", 1);
    const out = await client.call("t", "gemini-2.5-flash", z.object({ ok: z.boolean() }), "sys", [
      { text: "hi" },
    ]);
    expect(out.value).toEqual({ ok: true });
    expect(out.usage.costUsd).toBe(0);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain("k");
    expect((init as RequestInit).headers).toMatchObject({ "x-goog-api-key": "k" });
  });

  it("retries without the schema after a 400 and still validates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "bad schema" } }), { status: 400 }),
      )
      .mockResolvedValueOnce(reply('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeminiLLMClient("k", "m", "m", 1);
    const out = await client.call("t", "m", z.object({ ok: z.boolean() }), "sys", [{ text: "hi" }]);
    expect(out.value).toEqual({ ok: true });
    expect(
      JSON.parse(fetchMock.mock.calls[1]![1].body).generationConfig.responseJsonSchema,
    ).toBeUndefined();
  });

  it("rejects an answer that does not match the schema", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply('{"ok":"yes"}')));
    const client = new GeminiLLMClient("k", "m", "m", 1);
    await expect(
      client.call("t", "m", z.object({ ok: z.boolean() }), "sys", [{ text: "hi" }]),
    ).rejects.toThrow();
  });

  it("reports a bad key clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    const client = new GeminiLLMClient("k", "m", "m", 1);
    await expect(client.call("t", "m", z.object({}), "sys", [{ text: "hi" }])).rejects.toThrow(
      /GEMINI_API_KEY/,
    );
  });
});
