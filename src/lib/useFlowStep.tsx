import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveFlow, type ResolvedFlow } from './flows';

interface FlowContextValue {
  flow: ResolvedFlow;
  push: (id: string) => void;
  pop: (id: string) => void;
}

const FlowContext = createContext<FlowContextValue | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [stack, setStack] = useState<string[]>([]);
  const overlay = stack[stack.length - 1] ?? null;
  const flow = useMemo(() => resolveFlow(location.pathname, overlay), [location.pathname, overlay]);
  const value = useMemo<FlowContextValue>(
    () => ({
      flow,
      push: (id: string) => setStack((current) => (current[current.length - 1] === id ? current : [...current, id])),
      pop: (id: string) =>
        setStack((current) => {
          const index = current.lastIndexOf(id);
          if (index < 0) return current;
          return [...current.slice(0, index), ...current.slice(index + 1)];
        }),
    }),
    [flow],
  );
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useResolvedFlow(): ResolvedFlow {
  const value = useContext(FlowContext);
  if (!value) throw new Error('useResolvedFlow must be used inside FlowProvider');
  return value.flow;
}

/** Tag a dialog or a step inside a multi-step form. Pass null when that step is not active. */
export function useOverlayStep(id: string | null) {
  const value = useContext(FlowContext);
  useEffect(() => {
    if (!id || !value) return;
    value.push(id);
    return () => value.pop(id);
  }, [id, value]);
}
