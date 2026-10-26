import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

type Guard = {
  confirmLeave: () => boolean;
  setGuard: (guard: (() => boolean) | null) => void;
};
const Context = createContext<Guard>({
  confirmLeave: () => true,
  setGuard: () => {},
});
export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const guard = useRef<(() => boolean) | null>(null);
  const value = useMemo<Guard>(
    () => ({
      confirmLeave: () => guard.current?.() ?? true,
      setGuard: (next) => {
        guard.current = next;
      },
    }),
    [],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useNavigationGuard = () => useContext(Context);
