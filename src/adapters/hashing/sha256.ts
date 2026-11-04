/**
 * SHA-256 hashing for source evidence.
 *
 * Hashing happens locally through Web Crypto. No bytes ever leave the machine,
 * and the digest is the integrity anchor recorded on every SourceArtifact.
 */

/** Lowercase hex SHA-256 of the given bytes. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") {
    throw new Error(
      "SHA-256 is unavailable in this browser session (Web Crypto requires a secure context). Open the workbench over http://127.0.0.1 or https.",
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (const byte of view) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** SHA-256 of a UTF-8 string, used for excerpt and manifest hashes. */
export async function sha256HexOfText(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text).buffer as ArrayBuffer);
}

/** Human-readable byte size for compact evidence rows. */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
