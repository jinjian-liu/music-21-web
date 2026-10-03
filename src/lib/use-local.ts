import { useEffect, useState } from "react";
import { localDB, migrateLocal, type LocalPiece } from "./local-db";
import type { PracticeSession } from "../../shared/contracts";
import { errorText } from "./api";
export function useLocal() {
  const [pieces, setPieces] = useState<LocalPiece[]>([]),
    [sessions, setSessions] = useState<PracticeSession[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const update = () => {
      void Promise.all([localDB.all(), localDB.sessions()])
        .then(([p, s]) => {
          if (alive) {
            setPieces(p.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
            setSessions(
              s.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
            );
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(errorText(e));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    };
    void migrateLocal().then(update);
    window.addEventListener("xianzhi-data", update);
    return () => {
      alive = false;
      window.removeEventListener("xianzhi-data", update);
    };
  }, []);
  return { pieces, sessions, error, loading };
}
