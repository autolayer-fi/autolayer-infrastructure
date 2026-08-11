import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}
const ToastContext = createContext<
  (title: string, options?: { kind?: ToastKind; detail?: string }) => void
>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const notify = useCallback(
    (title: string, options?: { kind?: ToastKind; detail?: string }) => {
      const id = Date.now() + Math.random();
      setItems((current) =>
        current.some((item) => item.title === title && id - item.id < 1000)
          ? current
          : [
              ...current.slice(-3),
              {
                id,
                title,
                kind: options?.kind ?? "info",
                detail: options?.detail,
              },
            ],
      );
      window.setTimeout(
        () => setItems((current) => current.filter((item) => item.id !== id)),
        5500,
      );
    },
    [],
  );
  const value = useMemo(() => notify, [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3"
        aria-live="polite"
      >
        {items.map((item) => {
          const Icon =
            item.kind === "success"
              ? CheckCircle2
              : item.kind === "error"
                ? CircleAlert
                : Info;
          return (
            <div
              key={item.id}
              className={`rounded-xl border bg-slate-950/95 p-4 shadow-2xl backdrop-blur ${item.kind === "error" ? "border-red-400/30" : item.kind === "success" ? "border-emerald-300/30" : "border-white/15"}`}
            >
              <div className="flex gap-3">
                <Icon
                  size={18}
                  className={
                    item.kind === "error"
                      ? "text-red-300"
                      : item.kind === "success"
                        ? "text-emerald-300"
                        : "text-sky-300"
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  {item.detail && (
                    <p className="mt-1 break-words text-xs leading-5 text-slate-400">
                      {item.detail}
                    </p>
                  )}
                </div>
                <button
                  aria-label="Dismiss notification"
                  onClick={() =>
                    setItems((current) =>
                      current.filter((candidate) => candidate.id !== item.id),
                    )
                  }
                >
                  <X size={15} className="text-slate-500" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
