"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const SUPABASE_URL = "https://jhwfncfwmpttwfcyiefk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JEbbEKI_ZvC5pYGpEHmmgg_XkUEDw7j";

interface UserProfile {
  id: string;
  email: string;
  username?: string;
  display_name?: string;
  trust_tier: string;
  manifests_published: number;
  total_downloads: number;
  created_at: string;
}

interface Manifest {
  id: string;
  name: string;
  description: string;
  downloads: number;
  latest_version: string;
  updated_at: string;
}

function ProfileContent() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supabase, setSupabase] = useState<any>(null);

  useEffect(() => {
    import("@supabase/supabase-js").then(({ createClient }) => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      setSupabase(client);
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      try {
        // Fetch user profile
        const profileRes = await fetch(`${SUPABASE_URL}/functions/v1/whoami`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (profileRes.ok) {
          const profile = await profileRes.json();
          setUser({
            id: profile.user_id,
            email: profile.email,
            username: profile.username,
            display_name: profile.display_name,
            trust_tier: profile.trust_tier,
            manifests_published: profile.manifests_published,
            total_downloads: profile.total_downloads,
            created_at: profile.created_at,
          });

          // Fetch user's manifests
          const manifestsRes = await fetch(
            `${SUPABASE_URL}/functions/v1/search?owner=${profile.user_id}`
          );
          if (manifestsRes.ok) {
            const data = await manifestsRes.json();
            setManifests(data.results || []);
          }
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [supabase]);

  const handleLogin = async () => {
    if (!supabase) return;

    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/profile`,
      },
    });
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setManifests([]);
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={styles.loading}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.container}>
        <div style={styles.loginCard}>
          <h1 style={styles.title}>Sign in to Manifest AIM</h1>
          <p style={styles.subtitle}>View your published manifests and account settings</p>

          <button onClick={handleLogin} style={styles.loginButton}>
            <GithubIcon /> Continue with GitHub
          </button>

          <p style={styles.hint}>
            Or use the CLI: <code>manifest login</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.avatar}>
          {user.display_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 style={styles.name}>{user.display_name || user.email}</h1>
          {user.username && <p style={styles.username}>@{user.username}</p>}
          <span style={styles.trustBadge}>{formatTrustTier(user.trust_tier)}</span>
        </div>
        <button onClick={handleLogout} style={styles.logoutButton}>
          Sign Out
        </button>
      </div>

      <div style={styles.stats}>
        <div style={styles.stat}>
          <span style={styles.statValue}>{user.manifests_published}</span>
          <span style={styles.statLabel}>Manifests</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{user.total_downloads}</span>
          <span style={styles.statLabel}>Downloads</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{new Date(user.created_at).toLocaleDateString()}</span>
          <span style={styles.statLabel}>Member Since</span>
        </div>
      </div>

      <h2 style={styles.sectionTitle}>Your Manifests</h2>

      {manifests.length === 0 ? (
        <div style={styles.emptyState}>
          <p>You haven't published any manifests yet.</p>
          <pre style={styles.code}>
            <code>{`manifest init\nmanifest publish aim.yaml`}</code>
          </pre>
        </div>
      ) : (
        <div style={styles.manifestList}>
          {manifests.map((m) => (
            <a key={m.id} href={`/registry/${m.name}`} style={styles.manifestCard}>
              <h3 style={styles.manifestName}>{m.name}</h3>
              <p style={styles.manifestDesc}>{m.description}</p>
              <div style={styles.manifestMeta}>
                <span>v{m.latest_version}</span>
                <span>{m.downloads} downloads</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ marginRight: 8 }}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function formatTrustTier(tier: string): string {
  switch (tier) {
    case "verified": return "Verified Publisher";
    case "trusted": return "Trusted Author";
    case "community": return "Community";
    default: return "Unverified";
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: "0 auto",
    padding: "40px 20px",
  },
  loading: {
    textAlign: "center" as const,
    color: "#666",
  },
  loginCard: {
    textAlign: "center" as const,
    padding: 40,
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: "0 0 8px",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    margin: "0 0 24px",
  },
  loginButton: {
    display: "inline-flex",
    alignItems: "center",
    padding: "12px 24px",
    fontSize: 16,
    fontWeight: 600,
    border: "1px solid #ddd",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
  },
  hint: {
    marginTop: 24,
    fontSize: 14,
    color: "#666",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 32,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    fontWeight: 600,
  },
  name: {
    margin: 0,
    fontSize: 24,
    fontWeight: 600,
  },
  username: {
    margin: "4px 0",
    fontSize: 14,
    color: "#666",
  },
  trustBadge: {
    display: "inline-block",
    padding: "4px 8px",
    fontSize: 12,
    background: "#f3f4f6",
    borderRadius: 4,
    color: "#6366f1",
  },
  logoutButton: {
    marginLeft: "auto",
    padding: "8px 16px",
    fontSize: 14,
    border: "1px solid #ddd",
    borderRadius: 6,
    background: "#fff",
    cursor: "pointer",
  },
  stats: {
    display: "flex",
    gap: 32,
    marginBottom: 40,
    padding: 24,
    background: "#f9fafb",
    borderRadius: 12,
  },
  stat: {
    textAlign: "center" as const,
  },
  statValue: {
    display: "block",
    fontSize: 24,
    fontWeight: 700,
    color: "#1a1a2e",
  },
  statLabel: {
    fontSize: 14,
    color: "#666",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 600,
    margin: "0 0 16px",
  },
  emptyState: {
    textAlign: "center" as const,
    padding: 40,
    background: "#f9fafb",
    borderRadius: 12,
    color: "#666",
  },
  code: {
    display: "inline-block",
    marginTop: 16,
    padding: "12px 16px",
    background: "#1a1a2e",
    color: "#fff",
    borderRadius: 8,
    fontSize: 14,
    textAlign: "left" as const,
  },
  manifestList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
  },
  manifestCard: {
    display: "block",
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    textDecoration: "none",
    color: "inherit",
    transition: "all 0.2s",
  },
  manifestName: {
    margin: "0 0 4px",
    fontSize: 16,
    fontWeight: 600,
  },
  manifestDesc: {
    margin: "0 0 8px",
    fontSize: 14,
    color: "#666",
  },
  manifestMeta: {
    display: "flex",
    gap: 16,
    fontSize: 12,
    color: "#999",
  },
};

const Profile = dynamic(() => Promise.resolve(ProfileContent), { ssr: false });

export default function Page() {
  return <Profile />;
}

Page.getLayout = (page: React.ReactNode) => page;
