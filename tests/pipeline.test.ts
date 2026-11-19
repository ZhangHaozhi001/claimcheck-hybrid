import { describe, expect, it } from "vitest";
import { runCheck, type Backends } from "../src/pipeline";
import { mockDeep, mockScreen } from "../src/mock";
import type { HistoryStore } from "../src/store";
import type { HistoryEntry } from "../src/types";
import { SAMPLE_CLAIM, SAMPLE_CONTEXT } from "../src/sample";

class MemoryStore implements HistoryStore {
  readonly kind = "local" as const;
  entries: HistoryEntry[] = [];
  async save(entry: HistoryEntry): Promise<void> {
    this.entries.unshift(entry);
  }
  async list(limit: number): Promise<HistoryEntry[]> {
    return this.entries.slice(0, limit);
  }
}

const mockBackends: Backends = {
  label: "test mock",
  screen: async (input) => mockScreen(input),
  deep: async (input) => mockDeep(input),
};

describe("hybrid pipeline (demo mode, end-to-end)", () => {
  it("sample case: screen → escalate → cloud deep check → saved to history", async () => {
    const store = new MemoryStore();
    const entry = await runCheck(
      { claim: SAMPLE_CLAIM, context: SAMPLE_CONTEXT },
      mockBackends,
      store,
    );
    expect(entry.screen).toBeDefined();
    expect(entry.route?.escalateToCloud).toBe(true);
    expect(entry.tier).toBe("cloud");
    expect(entry.verdict).toBe("MISLEADING");
    expect(entry.id).toBeTruthy();
    const saved = await store.list(10);
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(entry.id);
  });

  it("settled short claim stays on-device and never touches the cloud tier", async () => {
    const store = new MemoryStore();
    let deepCalls = 0;
    const backends: Backends = {
      ...mockBackends,
      deep: async (input) => {
        deepCalls++;
        return mockDeep(input);
      },
    };
    const entry = await runCheck(
      {
        claim: "The fund holds 416,091,780 QOR in total.",
        context: "The QOR Builders Fund holds a total of 416,091,780 QOR for ecosystem programmes.",
      },
      backends,
      store,
    );
    expect(entry.route?.escalateToCloud).toBe(false);
    expect(entry.tier).toBe("on-device");
    expect(deepCalls).toBe(0);
  });
});
