// Mailgun inbound webhook -> creates a Flowist note from an email.
// Subject-line commands (Evernote-style):
//   @Notebook   -> route into a notebook (folder) by name (creates if missing)
//   #tag        -> add a tag
//   !YYYY-MM-DD -> stored in note payload as reminder date
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MG_SIGNING_KEY = Deno.env.get("MAILGUN_SIGNING_KEY") ?? "";

async function verifyMailgun(timestamp: string, token: string, signature: string) {
  if (!MG_SIGNING_KEY) return true; // allow in dev if key not set (log warning)
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(MG_SIGNING_KEY),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(timestamp + token));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === signature;
}

interface Parsed {
  cleanSubject: string;
  notebook?: string;
  tags: string[];
  reminder?: string;
}
function parseSubject(subject: string): Parsed {
  const tags: string[] = [];
  let notebook: string | undefined;
  let reminder: string | undefined;

  // @Notebook (last @word) — allow spaces in [Notebook Name]
  const nbBracket = subject.match(/@\[([^\]]+)\]/);
  if (nbBracket) { notebook = nbBracket[1].trim(); subject = subject.replace(nbBracket[0], ""); }
  else {
    const nb = subject.match(/@([A-Za-z0-9_\-]+)/);
    if (nb) { notebook = nb[1]; subject = subject.replace(nb[0], ""); }
  }
  // #tags
  subject = subject.replace(/#([A-Za-z0-9_\-]+)/g, (_m, t) => { tags.push(t); return ""; });
  // !date
  const dt = subject.match(/!(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
  if (dt) { reminder = dt[1].replaceAll("/", "-"); subject = subject.replace(dt[0], ""); }

  return { cleanSubject: subject.trim() || "(no subject)", notebook, tags, reminder };
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const form = await req.formData();
    const timestamp = String(form.get("timestamp") ?? "");
    const token = String(form.get("token") ?? "");
    const signature = String(form.get("signature") ?? "");
    const ok = await verifyMailgun(timestamp, token, signature);
    if (!ok) return new Response("Invalid signature", { status: 401 });

    const recipient = String(form.get("recipient") ?? "").toLowerCase().trim();
    const sender = String(form.get("sender") ?? "").toLowerCase().trim();
    const subject = String(form.get("subject") ?? "");
    const bodyPlain = String(form.get("body-plain") ?? "");
    const bodyHtml = String(form.get("body-html") ?? "");
    const strippedText = String(form.get("stripped-text") ?? bodyPlain);

    const localPart = recipient.split("@")[0];
    if (!localPart) return new Response("Bad recipient", { status: 400 });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: alias } = await supabase
      .from("email_aliases")
      .select("id, user_id, default_folder_id, is_active")
      .eq("local_part", localPart)
      .maybeSingle();

    if (!alias || !alias.is_active) {
      // Accept the mail silently to prevent bounces spam
      return new Response("No such alias", { status: 200 });
    }

    const parsed = parseSubject(subject);
    let folderId: string | null = alias.default_folder_id ?? null;

    if (parsed.notebook) {
      const { data: existing } = await supabase
        .from("folders")
        .select("id")
        .eq("user_id", alias.user_id)
        .ilike("name", parsed.notebook)
        .eq("is_deleted", false)
        .maybeSingle();
      if (existing) folderId = existing.id;
      else {
        const { data: nf } = await supabase
          .from("folders")
          .insert({ user_id: alias.user_id, name: parsed.notebook, color: "#6366f1" })
          .select("id").single();
        folderId = nf?.id ?? folderId;
      }
    }

    const body = strippedText || (bodyHtml ? htmlToText(bodyHtml) : "");
    const attachments: Array<{ name: string; url: string; type: string; size: number }> = [];

    const attachmentCount = Number(form.get("attachment-count") ?? 0);
    for (let i = 1; i <= attachmentCount; i++) {
      const f = form.get(`attachment-${i}`);
      if (!(f instanceof File)) continue;
      if (f.size > 20 * 1024 * 1024) continue;
      const path = `${alias.user_id}/email/${Date.now()}-${i}-${f.name}`;
      const buf = new Uint8Array(await f.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from("user-attachments")
        .upload(path, buf, { contentType: f.type || "application/octet-stream", upsert: false });
      if (!upErr) {
        const { data: signed } = await supabase.storage
          .from("user-attachments")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        attachments.push({ name: f.name, url: signed?.signedUrl ?? path, type: f.type, size: f.size });
      }
    }

    const attachmentsBlock = attachments.length
      ? "\n\n---\n**Attachments:**\n" + attachments.map(a => `• [${a.name}](${a.url})`).join("\n")
      : "";

    const { error: insErr } = await supabase.from("notes").insert({
      user_id: alias.user_id,
      title: parsed.cleanSubject.slice(0, 200),
      body: body + attachmentsBlock,
      folder_id: folderId,
      tags: parsed.tags,
      payload: {
        source: "email",
        from: sender,
        received_at: new Date().toISOString(),
        reminder: parsed.reminder,
        attachments,
        html: bodyHtml || null,
      },
    });

    if (insErr) {
      console.error("insert note error", insErr);
      return new Response("Insert failed", { status: 500 });
    }

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("inbound-email error", e);
    return new Response("Server error", { status: 500 });
  }
});
