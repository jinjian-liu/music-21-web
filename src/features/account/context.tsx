import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Account } from "../../../shared/contracts";
import { api, ApiError, errorText } from "../../lib/api";
const Context = createContext<{
  user: Account | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}>({ user: null, loading: true, error: "", refresh: async () => {} });
export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function refresh() {
    setLoading(true);
    try {
      setUser(await api<Account>("/api/auth/me"));
      setError("");
    } catch (e) {
      setUser(null);
      setError(e instanceof ApiError && e.status === 401 ? "" : errorText(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <Context.Provider value={{ user, loading, error, refresh }}>
      {children}
    </Context.Provider>
  );
}
export const useAccount = () => useContext(Context);
