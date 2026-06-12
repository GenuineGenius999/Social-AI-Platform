import { Buffer } from "node:buffer";
import { resolveOpenAIKey } from "@/lib/api-keys.server";

export type ImageGenOptions = {
  userId: string;
  prompt: string;
  quality?: "standard" | "hd";
  size?: "1024x1024" | "1792x1024" | "1024x1792";
};

export type ImageGenResult = {
  buf: Uint8Array;
  mime: string;
  revisedPrompt?: string;
};

const IMAGE_MODELS = ["gpt-image-1", "gpt-image-1-mini"] as const;
const CHAT_MODELS = ["gpt-4o", "gpt-4o-mini"] as const;

function mapQuality(quality: ImageGenOptions["quality"]): string {
  return quality === "standard" ? "medium" : "high";
}

function parseImageResponse(json: unknown): { buf: Uint8Array; mime: string; revisedPrompt?: string } {
  const item = (json as { data?: Array<Record<string, string>> })?.data?.[0];
  if (!item) throw new Error("No image data returned from OpenAI");

  if (item.b64_json) {
    return {
      buf: new Uint8Array(Buffer.from(item.b64_json, "base64")),
      mime: "image/png",
      revisedPrompt: item.revised_prompt,
    };
  }

  if (item.url) {
    throw new Error("URL_RESPONSE");
  }

  throw new Error("No image returned from OpenAI");
}

export async function generateImageWithOpenAI(opts: ImageGenOptions): Promise<ImageGenResult> {
  const key = await resolveOpenAIKey(opts.userId);
  let lastError = "Image generation failed";

  for (const model of IMAGE_MODELS) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: opts.prompt,
        n: 1,
        size: opts.size ?? "1024x1024",
        quality: mapQuality(opts.quality),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      lastError = text;
      if (res.status === 429) throw new Error("OpenAI rate limit reached. Try again shortly.");
      if (/model.*not exist|invalid_value|model_not_found/i.test(text)) continue;
      throw new Error(`Image generation failed: ${text.slice(0, 300)}`);
    }

    const json = await res.json();
    try {
      const parsed = parseImageResponse(json);
      return parsed;
    } catch (e) {
      if (e instanceof Error && e.message === "URL_RESPONSE" && (json as { data?: Array<{ url?: string }> })?.data?.[0]?.url) {
        const url = (json as { data: Array<{ url: string; revised_prompt?: string }> }).data[0].url;
        const downloaded = await downloadImageAsBuffer(url);
        return { ...downloaded, revisedPrompt: (json as { data: Array<{ revised_prompt?: string }> }).data[0].revised_prompt };
      }
      throw e;
    }
  }

  throw new Error(
    `Image generation failed: OpenAI image models unavailable. ${lastError.slice(0, 200)}`,
  );
}

export async function chatWithOpenAI(
  userId: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): Promise<string> {
  const key = await resolveOpenAIKey(userId);
  let lastError = "Chat failed";

  for (const model of CHAT_MODELS) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      lastError = text;
      if (res.status === 429) throw new Error("OpenAI rate limit reached.");
      if (/model.*not exist|does not exist/i.test(text)) continue;
      throw new Error(`Chat failed: ${text.slice(0, 300)}`);
    }

    const json = await res.json();
    return json?.choices?.[0]?.message?.content ?? "(no response)";
  }

  throw new Error(`Chat failed: ${lastError.slice(0, 300)}`);
}

export async function downloadImageAsBuffer(url: string): Promise<{ buf: Uint8Array; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to download generated image");
  const mime = res.headers.get("content-type") ?? "image/png";
  const buf = new Uint8Array(await res.arrayBuffer());
  return { buf, mime };
}
