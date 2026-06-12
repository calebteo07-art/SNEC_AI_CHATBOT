"use client";
/* Router adapter — drop-in shims for the react-router hooks the v1 screens
 * were written against, backed by next/navigation. Keeps the migration diff
 * to the import line; new code should use next/navigation directly. */
import { useCallback, useEffect, useMemo } from "react";
import { useParams as useNextParams, usePathname, useRouter } from "next/navigation";

export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (to: string, options?: NavigateOptions) => {
      if (options?.replace) router.replace(to);
      else router.push(to);
    },
    [router],
  );
}

export function useLocation() {
  const pathname = usePathname();
  return useMemo(() => ({ pathname }), [pathname]);
}

export function useParams<
  T extends Record<string, string | string[] | undefined> = Record<string, string | undefined>,
>(): T {
  return useNextParams() as unknown as T;
}

/** Render-time redirect mirroring react-router's <Navigate>. `state` is
 *  accepted for signature compatibility and discarded — no consumer reads it. */
export function Navigate({ to, replace }: { to: string; replace?: boolean; state?: unknown }) {
  const router = useRouter();
  useEffect(() => {
    if (replace) router.replace(to);
    else router.push(to);
  }, [to, replace, router]);
  return null;
}
