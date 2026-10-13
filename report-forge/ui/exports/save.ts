// Two small browser helpers the exports share.

// Hand the user a file: the browser's own download, named `filename`.
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  // Revoked on a later turn: some browsers read the URL after the click.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// An image as a data URL, for a file that must be self-contained. Any
// failure (fetch, read) returns undefined, so the image is simply absent and
// the document shows its "Missing image" note instead of the export failing.
export async function loadImageAsDataUrl(
  url: string,
): Promise<string | undefined> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return undefined;
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
