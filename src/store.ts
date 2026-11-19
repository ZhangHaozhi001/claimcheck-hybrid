/**
 * History storage: one interface, two implementations.
 *
 *  - FirestoreStore — production path (Firestore collection "checks"),
 *    used once a Firebase project is hooked up (see HOOKUP.md).
 *  - LocalStore — localStorage fallback used in demo mode and whenever
 *    Firebase is not configured, so history works fully offline.
 */
import type { HistoryEntry } from "./types";

export interface HistoryStore {
  readonly kind: "firestore" | "local";
  save(entry: HistoryEntry): Promise<void>;
  list(limit: number): Promise<HistoryEntry[]>;
}

const LOCAL_KEY = "claimcheck-hybrid-history-v1";

export class LocalStore implements HistoryStore {
  readonly kind = "local" as const;

  async save(entry: HistoryEntry): Promise<void> {
    const all = await this.list(500);
    all.unshift(entry);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all.slice(0, 500)));
  }

  async list(limit: number): Promise<HistoryEntry[]> {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const all = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
      return all.slice(0, limit);
    } catch {
      return [];
    }
  }
}

/**
 * Firestore-backed store. The Firestore SDK is imported dynamically so the
 * demo bundle never needs a Firebase config to boot.
 *
 * Resilience (added after the 2026-11-19 smoke test): if Firestore is
 * unreachable or the deployed security rules reject the operation, save
 * and list degrade to the local store with a console warning instead of
 * failing the whole check — a completed verdict must never be lost to a
 * storage problem. Once the rules from firestore.rules are deployed,
 * the Firestore path is used and the fallback stays silent.
 */
export class FirestoreStore implements HistoryStore {
  readonly kind = "firestore" as const;
  private readonly fallback = new LocalStore();
  private warned = false;

  constructor(private readonly db: unknown) {}

  private warnOnce(op: string, err: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(
      `[ClaimCheck] Firestore ${op} failed (${err instanceof Error ? err.message : String(err)}); ` +
        "history is using the local fallback. Deploy firestore.rules (HOOKUP.md step 4) to persist in Firestore.",
    );
  }

  async save(entry: HistoryEntry): Promise<void> {
    try {
      const { collection, doc, setDoc } = await import("firebase/firestore");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ref = doc(collection(this.db as any, "checks"), entry.id);
      await setDoc(ref, entry);
    } catch (err) {
      this.warnOnce("save", err);
      await this.fallback.save(entry);
    }
  }

  async list(limit: number): Promise<HistoryEntry[]> {
    try {
      const { collection, getDocs, limit: fbLimit, orderBy, query } = await import(
        "firebase/firestore"
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = query(collection(this.db as any, "checks"), orderBy("checkedAt", "desc"), fbLimit(limit));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as HistoryEntry);
    } catch (err) {
      this.warnOnce("list", err);
      return this.fallback.list(limit);
    }
  }
}
