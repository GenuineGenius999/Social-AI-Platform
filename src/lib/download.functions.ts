import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import JSZip from "jszip";
import { z } from "zod";

const IdInput = z.object({ generationId: z.string().uuid() });

export const getGenerationDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: gen, error } = await context.supabase
      .from("generations")
      .select("id,prompt,storage_path,image_url")
      .eq("id", data.generationId)
      .eq("user_id", context.userId)
      .single();

    if (error || !gen) throw new Error("Generation not found");

    let buf: Uint8Array;
    let mime = "image/png";
    let ext = "png";

    if (gen.storage_path) {
      const { data: file, error: dlErr } = await supabaseAdmin.storage
        .from("generated-images")
        .download(gen.storage_path);
      if (dlErr || !file) throw new Error("Could not download image from storage");
      mime = file.type || mime;
      ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? ext;
      buf = new Uint8Array(await file.arrayBuffer());
    } else if (gen.image_url) {
      const res = await fetch(gen.image_url);
      if (!res.ok) throw new Error("Could not fetch image");
      mime = res.headers.get("content-type") ?? mime;
      ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? ext;
      buf = new Uint8Array(await res.arrayBuffer());
    } else {
      throw new Error("No image available");
    }

    const slug = (gen.prompt ?? "image").slice(0, 40).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "image";
    const base64 = Buffer.from(buf).toString("base64");

    return {
      filename: `${slug}-${gen.id.slice(0, 8)}.${ext}`,
      mime,
      base64,
    };
  });

export const downloadAllGenerations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: gens, error } = await context.supabase
      .from("generations")
      .select("id,prompt,storage_path,image_url,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!gens?.length) throw new Error("No generations to download");

    const zip = new JSZip();

    for (let i = 0; i < gens.length; i++) {
      const gen = gens[i];
      let buf: Uint8Array;
      let ext = "png";

      if (gen.storage_path) {
        const { data: file } = await supabaseAdmin.storage.from("generated-images").download(gen.storage_path);
        if (!file) continue;
        const mime = file.type || "image/png";
        ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? ext;
        buf = new Uint8Array(await file.arrayBuffer());
      } else if (gen.image_url) {
        const res = await fetch(gen.image_url);
        if (!res.ok) continue;
        const mime = res.headers.get("content-type") ?? "image/png";
        ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? ext;
        buf = new Uint8Array(await res.arrayBuffer());
      } else {
        continue;
      }

      const slug = (gen.prompt ?? `image-${i + 1}`).slice(0, 30).replace(/[^a-z0-9]+/gi, "-") || `image-${i + 1}`;
      zip.file(`${String(i + 1).padStart(3, "0")}-${slug}.${ext}`, buf);
    }

    const zipBuf = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return {
      filename: `kinetik-generations-${new Date().toISOString().slice(0, 10)}.zip`,
      mime: "application/zip",
      base64: Buffer.from(zipBuf).toString("base64"),
    };
  });
