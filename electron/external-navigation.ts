export type WindowOpenKind =
  | "excalidraw-library"
  | "library-return"
  | "external"
  | "blocked";

const excalidrawLibraryOrigin = "https://libraries.excalidraw.com";
const dockyardLibraryReturnOrigin = "https://dockyard.local";
const dockyardLibraryReturnPath = "/library-return";

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isAllowedAppNavigation(
  value: string,
  rendererBaseUrl: string,
) {
  const target = parseUrl(value);
  const renderer = parseUrl(rendererBaseUrl);
  if (!target || !renderer) return false;
  return (
    target.protocol === renderer.protocol &&
    target.pathname === renderer.pathname &&
    (target.protocol === "file:" || target.origin === renderer.origin)
  );
}

export function isAllowedLibraryNavigation(value: string) {
  return parseUrl(value)?.origin === excalidrawLibraryOrigin;
}

export function isTrustedIpcSender({
  senderUrl,
  rendererBaseUrl,
  isMainFrame,
  belongsToPrivilegedWindow,
}: {
  senderUrl: string;
  rendererBaseUrl: string;
  isMainFrame: boolean;
  belongsToPrivilegedWindow: boolean;
}) {
  return (
    isMainFrame &&
    belongsToPrivilegedWindow &&
    isAllowedAppNavigation(senderUrl, rendererBaseUrl)
  );
}

export function classifyWindowOpen(
  value: string,
  rendererBaseUrl: string,
): WindowOpenKind {
  const target = parseUrl(value);
  if (!target || !parseUrl(rendererBaseUrl)) return "blocked";

  if (target.origin === excalidrawLibraryOrigin)
    return "excalidraw-library";

  const sameRenderer = isAllowedAppNavigation(value, rendererBaseUrl);
  const hash = new URLSearchParams(target.hash.slice(1));
  const isDockyardLibraryReturn =
    target.origin === dockyardLibraryReturnOrigin &&
    target.pathname === dockyardLibraryReturnPath;
  if (
    (sameRenderer || isDockyardLibraryReturn) &&
    target.searchParams.get("view") === "annotator" &&
    hash.has("addLibrary")
  )
    return "library-return";
  if ((sameRenderer || isDockyardLibraryReturn) && hash.has("addLibrary"))
    return "blocked";

  if (target.protocol === "https:" || target.protocol === "http:")
    return "external";
  return "blocked";
}
