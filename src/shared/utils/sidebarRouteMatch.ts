type SidebarLikeItem = {
  href: string;
  exact?: boolean;
  external?: boolean;
};

function getPathname(href: string): string {
  return href.split("?", 1)[0];
}

export function matchesSidebarHref(
  pathname: string | null | undefined,
  href: string,
  exact = false
): boolean {
  if (!pathname) return false;
  const hrefPathname = getPathname(href);
  if (exact) return pathname === hrefPathname;
  return pathname === hrefPathname || pathname.startsWith(`${hrefPathname}/`);
}

export function getActiveSidebarHref(
  pathname: string | null | undefined,
  items: SidebarLikeItem[],
  search = ""
): string | null {
  let bestMatch: SidebarLikeItem | null = null;

  for (const item of items) {
    if (item.external) continue;
    if (!matchesSidebarHref(pathname, item.href, item.exact === true)) continue;

    const itemQuery = item.href.split("?", 2)[1];
    if (itemQuery && itemQuery !== search) continue;

    if (!bestMatch) {
      bestMatch = item;
      continue;
    }

    const itemPathnameLength = getPathname(item.href).length;
    const bestMatchPathnameLength = getPathname(bestMatch.href).length;

    if (itemPathnameLength > bestMatchPathnameLength) {
      bestMatch = item;
      continue;
    }

    if (
      itemPathnameLength === bestMatchPathnameLength &&
      item.href.includes("?") &&
      !bestMatch.href.includes("?")
    ) {
      bestMatch = item;
      continue;
    }

    if (
      itemPathnameLength === bestMatchPathnameLength &&
      item.href.includes("?") === bestMatch.href.includes("?") &&
      item.exact &&
      !bestMatch.exact
    ) {
      bestMatch = item;
    }
  }

  return bestMatch?.href || null;
}
