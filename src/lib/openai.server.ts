import process from "node:process";

function getOpenAIKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY. Add it to your .env file.");
  return key;
}

export async function generateImageWithOpenAI(prompt: string): Promise<{ url: string; revisedPrompt?: string }> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("OpenAI rate limit reached. Try again shortly.");
    throw new Error(`Image generation failed: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const url: string | undefined = json?.data?.[0]?.url;
  if (!url) throw new Error("No image URL returned from OpenAI");
  return { url, revisedPrompt: json?.data?.[0]?.revised_prompt };
}

export async function chatWithOpenAI(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("OpenAI rate limit reached.");
    throw new Error(`Chat failed: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "(no response)";
}

export async function downloadImageAsBuffer(url: string): Promise<{ buf: Uint8Array; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to download generated image");
  const mime = res.headers.get("content-type") ?? "image/png";
  const buf = new Uint8Array(await res.arrayBuffer());
  return { buf, mime };
}
