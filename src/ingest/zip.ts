import { unzip } from "fflate";

export interface RawExport {
  /** basename → GPX text */
  gpxFiles: Map<string, string>;
  exportXml: string | null;
}

const WANTED = /(workout-routes\/[^/]+\.gpx|(^|\/)export\.xml)$/;

export function readExportZip(data: Uint8Array): Promise<RawExport> {
  return new Promise((resolve, reject) => {
    unzip(data, { filter: (f) => WANTED.test(f.name) }, (err, out) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const dec = new TextDecoder();
      const gpxFiles = new Map<string, string>();
      let exportXml: string | null = null;
      for (const [name, bytes] of Object.entries(out)) {
        if (name.endsWith(".gpx")) {
          gpxFiles.set(name.split("/").pop()!, dec.decode(bytes));
        } else {
          exportXml = dec.decode(bytes);
        }
      }
      resolve({ gpxFiles, exportXml });
    });
  });
}
