import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useBlockedUsers } from "@/hooks/use-chat-social";
import { getUserApiKeyStatus, saveUserApiKey } from "@/lib/settings.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Ban, ImagePlus, User } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const getStatus = useServerFn(getUserApiKeyStatus);
  const saveKey = useServerFn(saveUserApiKey);
  const [apiKey, setApiKey] = useState("");
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const { blocked, unblockUser } = useBlockedUsers(me);

  const status = useQuery({
    queryKey: ["user-api-key"],
    queryFn: () => getStatus(),
  });

  const save = useMutation({
    mutationFn: () => saveKey({ data: { openaiApiKey: apiKey.trim() || null } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["user-api-key"] });
      setApiKey("");
      toast.success(res.removed ? "Personal API key removed" : "Personal API key saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <AppShell>
      <div className="p-4 lg:p-8 max-w-xl">
        <div className="mono-label">/SETTINGS</div>
        <h1 className="font-display text-5xl uppercase mt-1">Your Settings</h1>

        <ProfileSection me={me} />

        <div className="paper-card p-6 mt-8 space-y-4">
          <div>
            <h2 className="font-display text-xl uppercase">OpenAI API Key (optional)</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Use your own key for image generation and AI chat. If unset, the platform default is used.
            </p>
          </div>

          {status.data?.hasKey && (
            <p className="font-mono text-sm">
              Current: <span className="text-primary">{status.data.masked}</span>
            </p>
          )}

          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-... (leave empty to remove)"
            className="w-full border border-line bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
          />

          <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="rust-button px-6 py-2 text-sm">
            {save.isPending ? "Saving…" : status.data?.hasKey ? "Update key" : "Save key"}
          </button>
        </div>

        <BlockedUsersSection blocked={blocked} unblockUser={unblockUser} />
      </div>
    </AppShell>
  );
}

function ProfileSection({ me }: { me: string | null }) {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<{
    id: string;
    username: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    gender: "male" | "female" | "other" | null;
  } | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("male");

  useEffect(() => {
    if (!me) return;
    supabase
      .from("profiles")
      .select("id,username,display_name,bio,avatar_url,gender")
      .eq("id", me)
      .single()
      .then(({ data }) => {
        const p = data as typeof profile;
        if (!p) return;
        setProfile(p);
        setDisplayName(p.display_name ?? "");
        setBio(p.bio ?? "");
        setGender((p.gender ?? "male") as "male" | "female" | "other");
      });
  }, [me]);

  async function uploadAvatar(file: File) {
    if (!me) return;
    setLoading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${me}/avatar/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        contentType: file.type || "image/png",
      });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr || !signed) throw signErr ?? new Error("Could not sign URL");

      const { error } = await supabase.from("profiles").update({ avatar_url: signed.signedUrl }).eq("id", me);
      if (error) throw error;

      setProfile((p) => (p ? { ...p, avatar_url: signed.signedUrl } : p));
      toast.success("Avatar updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Avatar upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!me) return;
    setLoading(true);
    try {
      const next: Partial<typeof profile> = {
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        gender,
      };

      const defaultAvatar =
        gender === "female"
          ? "https://i.postimg.cc/TwXFHVwW/d1776321-55e5-4c0f-aa56-754ce2798bfa.jpg"
          : gender === "male"
            ? "https://i.postimg.cc/tJkK6s9n/1c7c50c4-7292-4577-beb0-8bc7270f6c05.jpg"
            : null;

      if (!profile?.avatar_url && defaultAvatar) {
        next.avatar_url = defaultAvatar;
      }

      const { error } = await supabase.from("profiles").update(next).eq("id", me);
      if (error) throw error;
      setProfile((p) => (p ? { ...p, ...(next as any) } : p));
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="paper-card p-6 mt-8 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="size-5 text-muted-foreground" />
          <h2 className="font-display text-xl uppercase">Profile</h2>
        </div>
        {profile?.username && (
          <Link
            to="/u/$username"
            params={{ username: profile.username }}
            className="mono-label text-primary hover:underline"
          >
            Preview →
          </Link>
        )}
      </div>

      <div className="flex items-center gap-4">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="size-16 rounded-full border border-line object-cover" />
        ) : (
          <div className="size-16 rounded-full bg-paper-2 border border-line grid place-items-center font-mono text-xl">
            {(profile?.username?.[0] ?? "?").toUpperCase()}
          </div>
        )}

        <label className="inline-flex items-center gap-2 border border-line px-3 py-2 text-xs cursor-pointer hover:bg-paper-2">
          <ImagePlus className="size-4" />
          Change avatar
          <input
            type="file"
            className="hidden"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadAvatar(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      <div className="grid gap-3">
        <div>
          <label className="mono-label block mb-1">DISPLAY NAME</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full border border-line bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="mono-label block mb-1">GENDER</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as "male" | "female" | "other")}
            className="w-full border border-line bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="mono-label block mb-1">BIO</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="w-full border border-line bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
            placeholder="A short bio..."
          />
        </div>
      </div>

      <button type="button" onClick={saveProfile} disabled={loading || !me} className="rust-button px-6 py-2 text-sm">
        {loading ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}

function BlockedUsersSection({
  blocked,
  unblockUser,
}: {
  blocked: Set<string>;
  unblockUser: (id: string) => Promise<void>;
}) {
  const [profiles, setProfiles] = useState<{ id: string; username: string }[]>([]);

  useEffect(() => {
    if (blocked.size === 0) {
      setProfiles([]);
      return;
    }
    supabase
      .from("profiles")
      .select("id,username")
      .in("id", [...blocked])
      .then(({ data }) => setProfiles((data ?? []) as { id: string; username: string }[]));
  }, [blocked]);

  return (
    <div className="paper-card p-6 mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <Ban className="size-5 text-muted-foreground" />
        <h2 className="font-display text-xl uppercase">Blocked users</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Users you blocked in private chat. Unblock to resume messaging.
      </p>
      {profiles.length === 0 ? (
        <p className="mono-label">No blocked users.</p>
      ) : (
        <ul className="space-y-2">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center justify-between border border-line px-3 py-2">
              <span className="font-mono text-sm">@{p.username}</span>
              <button
                type="button"
                onClick={async () => {
                  await unblockUser(p.id);
                  setProfiles((cur) => cur.filter((x) => x.id !== p.id));
                  toast.success(`Unblocked @${p.username}`);
                }}
                className="ink-button px-3 py-1 text-xs"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
