export type WindowOpenKind =
  | "excalidraw-library"
  | "library-return"
  | "external"
  | "blocked";

const excalidrawLibraryOrigin = "https://libraries.excalidraw.com";
const dockyardLibraryReturnOrigin = "https://dockyard.local";
const dockyardLibraryReturnPath = "/library-return";

export function classifyWindowOpen(
  value: string,
  rendererBaseUrl: string,
): WindowOpenKind {
  let target: URL;
  let renderer: URL;
  try {
    target = new URL(value);
    renderer = new URL(rendererBaseUrl);
  } catch {
    return "blocked";
  }

  if (target.origin === excalidrawLibraryOrigin)
    return "excalidraw-library";

  const sameRenderer =
    target.protocol === renderer.protocol &&
    target.pathname === renderer.pathname &&
    (target.protocol === "file:" || target.origin === renderer.origin);
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
