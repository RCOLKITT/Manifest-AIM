"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const SUPABASE_URL = "https://jhwfncfwmpttwfcyiefk.supabase.co";

interface Manifest {
  id: string;
  name: string;
  description: string;
  tags: string[];
  domain: string;
  downloads: number;
  stars: number;
  latest_version: string;
  is_official: boolean;
  owner_id: string;
}

function RegistryContent() {
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchManifests();
  }, []);

  const fetchManifests = async (query?: string) => {
    setLoading(true);
    try {
      const url = query
        ? `${SUPABASE_URL}/functions/v1/search?q=${encodeURIComponent(query)}`
        : `${SUPABASE_URL}/functions/v1/search`;

      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch manifests");

      const data = await response.json();
      setManifests(data.results || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchManifests(search);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Manifest Registry</h1>
        <p style={styles.subtitle}>Discover and share AI governance manifests</p>

        <form onSubmit={handleSearch} style={styles.searchForm}>
          <input
            type="text"
            placeholder="Search manifests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
          <button type="submit" style={styles.searchButton}>
            Search
          </button>
        </form>
      </div>

      {loading && <p style={styles.loading}>Loading manifests...</p>}

      {error && <p style={styles.error}>{error}</p>}

      {!loading && !error && (
        <div style={styles.grid}>
          {manifests.length === 0 ? (
            <p style={styles.empty}>No manifests found. Be the first to publish!</p>
          ) : (
            manifests.map((m) => (
              <a key={m.id} href={`/registry/${m.name}`} style={styles.card}>
                <div style={styles.cardHeader}>
                  <h3 style={styles.cardTitle}>
                    {m.is_official && <span style={styles.official}>official</span>}
                    {m.name}
                  </h3>
                  <span style={styles.version}>v{m.latest_version}</span>
                </div>
                <p style={styles.cardDescription}>{m.description}</p>
                <div style={styles.cardMeta}>
                  <span style={styles.downloads}>{m.downloads} downloads</span>
                  {m.tags?.slice(0, 3).map((tag) => (
                    <span key={tag} style={styles.tag}>{tag}</span>
                  ))}
                </div>
              </a>
            ))
          )}
        </div>
      )}

      <div style={styles.cta}>
        <h2>Publish Your Manifest</h2>
        <pre style={styles.code}>
          <code>
{`manifest login
manifest publish aim.yaml`}
          </code>
        </pre>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "40px 20px",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: 700,
    margin: "0 0 8px",
  },
  subtitle: {
    fontSize: 18,
    color: "#666",
    margin: "0 0 24px",
  },
  searchForm: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
    maxWidth: 500,
    margin: "0 auto",
  },
  searchInput: {
    flex: 1,
    padding: "12px 16px",
    fontSize: 16,
    border: "1px solid #ddd",
    borderRadius: 8,
    outline: "none",
  },
  searchButton: {
    padding: "12px 24px",
    fontSize: 16,
    fontWeight: 600,
    border: "none",
    borderRadius: 8,
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    color: "#fff",
    cursor: "pointer",
  },
  loading: {
    textAlign: "center" as const,
    color: "#666",
  },
  error: {
    textAlign: "center" as const,
    color: "#dc2626",
  },
  empty: {
    textAlign: "center" as const,
    color: "#666",
    gridColumn: "1 / -1",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: 20,
    marginBottom: 40,
  },
  card: {
    display: "block",
    padding: 20,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    textDecoration: "none",
    color: "inherit",
    transition: "all 0.2s",
    background: "#fff",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
  },
  official: {
    background: "#10b981",
    color: "#fff",
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 4,
    marginRight: 8,
    textTransform: "uppercase" as const,
  },
  version: {
    fontSize: 12,
    color: "#666",
  },
  cardDescription: {
    margin: "0 0 12px",
    fontSize: 14,
    color: "#666",
    lineHeight: 1.5,
  },
  cardMeta: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    fontSize: 12,
  },
  downloads: {
    color: "#666",
  },
  tag: {
    background: "#f3f4f6",
    padding: "2px 8px",
    borderRadius: 4,
    color: "#6366f1",
  },
  cta: {
    textAlign: "center" as const,
    padding: 40,
    background: "#f9fafb",
    borderRadius: 12,
  },
  code: {
    display: "inline-block",
    background: "#1a1a2e",
    color: "#fff",
    padding: "16px 24px",
    borderRadius: 8,
    textAlign: "left" as const,
    fontSize: 14,
  },
};

const Registry = dynamic(() => Promise.resolve(RegistryContent), { ssr: false });

export default function Page() {
  return <Registry />;
}

Page.getLayout = (page: React.ReactNode) => page;
