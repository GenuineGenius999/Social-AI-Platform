const MACHINE_KEY = "kinetik_machine_id";

export function getMachineId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(MACHINE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(MACHINE_KEY, id);
  }
  return id;
}

export function detectOs(): { osName: string; osVersion: string } {
  if (typeof navigator === "undefined") return { osName: "Unknown", osVersion: "" };
  const ua = navigator.userAgent;

  if (/Android/i.test(ua)) {
    const m = ua.match(/Android\s+([\d.]+)/i);
    return { osName: "Android", osVersion: m?.[1] ?? "" };
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    const m = ua.match(/OS\s+([\d_]+)/i);
    return { osName: "iPhone", osVersion: m?.[1]?.replace(/_/g, ".") ?? "" };
  }
  if (/Windows NT/i.test(ua)) {
    const m = ua.match(/Windows NT\s+([\d.]+)/i);
    const ver = m?.[1];
    const map: Record<string, string> = { "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" };
    return { osName: "Windows", osVersion: map[ver ?? ""] ?? ver ?? "" };
  }
  if (/Mac OS X/i.test(ua)) {
    const m = ua.match(/Mac OS X\s+([\d_]+)/i);
    return { osName: "MacOS", osVersion: m?.[1]?.replace(/_/g, ".") ?? "" };
  }
  if (/Ubuntu/i.test(ua)) return { osName: "Ubuntu", osVersion: "" };
  if (/Linux/i.test(ua)) return { osName: "Linux", osVersion: "" };
  return { osName: "Unknown", osVersion: "" };
}
