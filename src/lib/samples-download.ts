/** Trigger download of the sample pack. On Windows, auto-downloads on signup. */
export function isWindows(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Win/i.test(navigator.userAgent) || /Win/i.test(navigator.platform);
}

export function downloadSamplesPack(): void {
  const a = document.createElement("a");
  a.href = "/samples.rar";
  a.download = "kinetik-samples.rar";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
