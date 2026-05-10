"use client";

import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams, useParams as useNextParams } from "next/navigation";
import type { AnchorHTMLAttributes, ReactNode } from "react";

export type NavigateOptions = {
  replace?: boolean;
  scroll?: boolean;
  state?: any;
};

export type LocationLike = {
  pathname: string;
  search: string;
  hash: string;
  state?: any;
};

export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children?: ReactNode;
};

export function AppLink({ to, children, ...props }: LinkProps) {
  return (
    <NextLink href={to} {...props}>
      {children}
    </NextLink>
  );
}

export function useNavigate() {
  const router = useRouter();

  return (to: string, options?: NavigateOptions) => {
    if (options?.replace) {
      router.replace(to, { scroll: options.scroll });
      return;
    }

    router.push(to, { scroll: options?.scroll });
  };
}

export function useLocation(): LocationLike {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  return {
    pathname,
    search: search ? `?${search}` : "",
    hash: "",
    state: undefined,
  };
}

export { useSearchParams };
export function useParams<T extends Record<string, string | string[] | undefined> = Record<string, string | string[] | undefined>>() {
  const params = useNextParams<T>() || {};
  return params as T;
}
export const Link = AppLink;
export const Outlet = () => null;
export default AppLink;
