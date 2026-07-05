/** Pure file-routing logic for the drop zone / file picker. No DOM reads
 *  beyond the File objects themselves — no window, no document. */

export type FileRoute =
  | { kind: "zip"; file: File }
  | { kind: "gpx"; files: File[] }
  | { kind: "none" };

function isZip(f: File): boolean {
  return /\.zip$/i.test(f.name) || /zip/i.test(f.type);
}

function isGpx(f: File): boolean {
  return /\.gpx$/i.test(f.name);
}

/** .zip (name or type) → zip (first zip wins); else all *.gpx files → gpx;
 *  else none. Case-insensitive. */
export function routeFiles(files: readonly File[]): FileRoute {
  const zip = files.find(isZip);
  if (zip) return { kind: "zip", file: zip };

  const gpx = files.filter(isGpx);
  if (gpx.length > 0) return { kind: "gpx", files: gpx };

  return { kind: "none" };
}

/** Loose GPX files → RawExport shape: { gpxFiles: Map(name→text), exportXml: null } */
export async function gpxToRaw(
  files: readonly File[]
): Promise<{ gpxFiles: Map<string, string>; exportXml: string | null }> {
  const gpxFiles = new Map<string, string>();
  for (const f of files) {
    gpxFiles.set(f.name, await f.text());
  }
  return { gpxFiles, exportXml: null };
}
