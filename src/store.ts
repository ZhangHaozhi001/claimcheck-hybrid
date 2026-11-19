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
 * TODO-HOOKUP: requires a real Firebase project (see HOOKUP.md steps 1–3).
 */
export class FirestoreStore implements HistoryStore {
  readonly kind = "firestore" as const;

  constructor(private readonly db: unknown) {}

  async save(entry: HistoryEntry): Promise<void> {
    const { collection, doc, setDoc } = await import("firebase/firestore");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = doc(collection(this.db as any, "checks"), entry.id);
    await setDoc(ref, entry);
  }

  async list(limit: number): Promise<HistoryEntry[]> {
    const { collection, getDocs, limit: fbLimit, orderBy, query } = await import(
      "firebase/firestore"
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = query(collection(this.db as any, "checks"), orderBy("checkedAt", "desc"), fbLimit(limit));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as HistoryEntry);
  }
}
