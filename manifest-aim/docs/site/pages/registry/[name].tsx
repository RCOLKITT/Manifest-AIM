"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jhwfncfwmpttwfcyiefk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZmZuY2Z3bXB0dHdmY3lpZWZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3NTczNzksImV4cCI6MjA2NTMzMzM3OX0.n4PZ2E-4GZpWJbTpLXOBVrVJcuKO7InCakULdKj7LfY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface ManifestDetail {
  id: string;
  name: string;
  display_name: string;
  description: string;
  tags: string[];
  domain: string;
  downloads: number;
  stars: number;
  is_official: boolean;
  is_verified: boolean;
  repository_url: string;
  homepage_url: string;
  license: string;
  created_at: string;
  updated_at: string;
  versions: {
    version: string;
    aim_version: string;
    rule_count: number;
    capability_count: number;
    knowledge_count: number;
    published_at: string;
  }[];
  latest: {
    version: string;
    content: any;
    readme: string;
  };
}

interface Comment {
  id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  user_id: string;
  user_email: string;
  user_name: string;
  user_avatar: string | null;
  replies?: Comment[];
}

function ManifestDetailContent() {
  const router = useRouter();
  const { name } = router.query;
  const [manifest, setManifest] = useState<ManifestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [user, setUser] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // Check auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!name) return;

    const fetchManifest = async () => {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/manifests/${name}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Manifest not found");
          } else {
            throw new Error("Failed to fetch manifest");
          }
          return;
        }
        const data = await response.json();
        setManifest(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchManifest();
    fetchComments();
  }, [name]);

  const fetchComments = async () => {
    if (!name) return;
    setCommentsLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/comments/${name}`);
      if (response.ok) {
        const data = await response.json();
        setComments(data);
      }
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.href,
      },
    });
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${SUPABASE_URL}/functions/v1/comments/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ content: newComment }),
      });

      if (response.ok) {
        setNewComment("");
        fetchComments();
      }
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!user || !replyContent.trim()) return;

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${SUPABASE_URL}/functions/v1/comments/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ content: replyContent, parent_id: parentId }),
      });

      if (response.ok) {
        setReplyContent("");
        setReplyingTo(null);
        fetchComments();
      }
    } catch (err) {
      console.error("Failed to post reply:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const copyInstallCommand = () => {
    navigator.clipboard.writeText(`manifest install ${name}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={styles.loading}>Loading...</p>
      </div>
    );
  }

  if (error || !manifest) {
    return (
      <div style={styles.container}>
        <div style={styles.errorCard}>
          <h1>Manifest Not Found</h1>
          <p>The manifest "{name}" doesn't exist or has been removed.</p>
          <a href="/registry" style={styles.backLink}>
            ← Back to Registry
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            {manifest.is_official && <span style={styles.officialBadge}>Official</span>}
            {manifest.is_verified && <span style={styles.verifiedBadge}>Verified</span>}
            {manifest.display_name || manifest.name}
          </h1>
          <p style={styles.description}>{manifest.description}</p>
        </div>
      </div>

      <div style={styles.installBox}>
        <code style={styles.installCommand}>manifest install {manifest.name}</code>
        <button onClick={copyInstallCommand} style={styles.copyButton}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div style={styles.meta}>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Version</span>
          <span style={styles.metaValue}>{manifest.latest?.version || "0.0.0"}</span>
        </div>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Downloads</span>
          <span style={styles.metaValue}>{manifest.downloads.toLocaleString()}</span>
        </div>
        {manifest.license && (
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>License</span>
            <span style={styles.metaValue}>{manifest.license}</span>
          </div>
        )}
        {manifest.domain && (
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Domain</span>
            <span style={styles.metaValue}>{manifest.domain}</span>
          </div>
        )}
      </div>

      {manifest.tags && manifest.tags.length > 0 && (
        <div style={styles.tags}>
          {manifest.tags.map((tag) => (
            <span key={tag} style={styles.tag}>{tag}</span>
          ))}
        </div>
      )}

      <div style={styles.content}>
        <div style={styles.mainContent}>
          <h2>README</h2>
          {manifest.latest?.readme ? (
            <div
              style={styles.readme}
              dangerouslySetInnerHTML={{ __html: manifest.latest.readme }}
            />
          ) : (
            <p style={styles.noReadme}>No README provided</p>
          )}

          <h2>Manifest Preview</h2>
          <pre style={styles.yamlPreview}>
            <code>{JSON.stringify(manifest.latest?.content || {}, null, 2)}</code>
          </pre>

          {/* Comments Section */}
          <div style={styles.commentsSection}>
            <h2>Discussion ({comments.length})</h2>

            {/* Comment Form */}
            {user ? (
              <form onSubmit={handleSubmitComment} style={styles.commentForm}>
                <div style={styles.commentInputRow}>
                  <img
                    src={user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${user.email}`}
                    alt=""
                    style={styles.avatar}
                  />
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Join the discussion..."
                    style={styles.commentInput}
                    rows={3}
                  />
                </div>
                <div style={styles.commentActions}>
                  <button
                    type="submit"
                    disabled={submitting || !newComment.trim()}
                    style={{
                      ...styles.submitButton,
                      opacity: submitting || !newComment.trim() ? 0.5 : 1,
                    }}
                  >
                    {submitting ? "Posting..." : "Post Comment"}
                  </button>
                </div>
              </form>
            ) : (
              <div style={styles.signInPrompt}>
                <p>Sign in to join the discussion</p>
                <button onClick={handleSignIn} style={styles.signInButton}>
                  Sign in with GitHub
                </button>
              </div>
            )}

            {/* Comments List */}
            {commentsLoading ? (
              <p style={styles.loading}>Loading comments...</p>
            ) : comments.length === 0 ? (
              <p style={styles.noComments}>No comments yet. Be the first to comment!</p>
            ) : (
              <div style={styles.commentsList}>
                {comments.map((comment) => (
                  <div key={comment.id} style={styles.commentThread}>
                    <div style={styles.comment}>
                      <img
                        src={comment.user_avatar || `https://ui-avatars.com/api/?name=${comment.user_name}`}
                        alt=""
                        style={styles.avatar}
                      />
                      <div style={styles.commentBody}>
                        <div style={styles.commentHeader}>
                          <span style={styles.commentAuthor}>{comment.user_name}</span>
                          <span style={styles.commentDate}>{formatDate(comment.created_at)}</span>
                        </div>
                        <p style={styles.commentContent}>{comment.content}</p>
                        {user && (
                          <button
                            onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                            style={styles.replyButton}
                          >
                            Reply
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Reply Form */}
                    {replyingTo === comment.id && (
                      <div style={styles.replyForm}>
                        <textarea
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          placeholder="Write a reply..."
                          style={styles.replyInput}
                          rows={2}
                        />
                        <div style={styles.replyActions}>
                          <button
                            onClick={() => setReplyingTo(null)}
                            style={styles.cancelButton}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSubmitReply(comment.id)}
                            disabled={submitting || !replyContent.trim()}
                            style={{
                              ...styles.submitButton,
                              opacity: submitting || !replyContent.trim() ? 0.5 : 1,
                            }}
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Replies */}
                    {comment.replies && comment.replies.length > 0 && (
                      <div style={styles.replies}>
                        {comment.replies.map((reply) => (
                          <div key={reply.id} style={styles.comment}>
                            <img
                              src={reply.user_avatar || `https://ui-avatars.com/api/?name=${reply.user_name}`}
                              alt=""
                              style={styles.avatarSmall}
                            />
                            <div style={styles.commentBody}>
                              <div style={styles.commentHeader}>
                                <span style={styles.commentAuthor}>{reply.user_name}</span>
                                <span style={styles.commentDate}>{formatDate(reply.created_at)}</span>
                              </div>
                              <p style={styles.commentContent}>{reply.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={styles.sidebar}>
          <h3>Versions</h3>
          <ul style={styles.versionList}>
            {manifest.versions?.map((v) => (
              <li key={v.version} style={styles.versionItem}>
                <span style={styles.versionNumber}>{v.version}</span>
                <span style={styles.versionDate}>
                  {new Date(v.published_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>

          {manifest.repository_url && (
            <div style={styles.sidebarSection}>
              <h3>Repository</h3>
              <a href={manifest.repository_url} target="_blank" rel="noopener noreferrer" style={styles.link}>
                View Source →
              </a>
            </div>
          )}

          {manifest.homepage_url && (
            <div style={styles.sidebarSection}>
              <h3>Homepage</h3>
              <a href={manifest.homepage_url} target="_blank" rel="noopener noreferrer" style={styles.link}>
                Visit →
              </a>
            </div>
          )}
        </div>
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
  loading: {
    textAlign: "center" as const,
    color: "#666",
  },
  errorCard: {
    textAlign: "center" as const,
    padding: 40,
    background: "#f9fafb",
    borderRadius: 12,
  },
  backLink: {
    display: "inline-block",
    marginTop: 16,
    color: "#6366f1",
    textDecoration: "none",
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    margin: "0 0 8px",
  },
  officialBadge: {
    background: "#10b981",
    color: "#fff",
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 4,
    marginRight: 12,
    verticalAlign: "middle",
  },
  verifiedBadge: {
    background: "#6366f1",
    color: "#fff",
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 4,
    marginRight: 12,
    verticalAlign: "middle",
  },
  description: {
    fontSize: 18,
    color: "#666",
    margin: 0,
  },
  installBox: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 16,
    background: "#1a1a2e",
    borderRadius: 8,
    marginBottom: 24,
  },
  installCommand: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontFamily: "monospace",
  },
  copyButton: {
    padding: "8px 16px",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 6,
    background: "#6366f1",
    color: "#fff",
    cursor: "pointer",
  },
  meta: {
    display: "flex",
    gap: 32,
    marginBottom: 24,
    padding: 20,
    background: "#f9fafb",
    borderRadius: 8,
  },
  metaItem: {
    display: "flex",
    flexDirection: "column" as const,
  },
  metaLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 16,
    fontWeight: 600,
  },
  tags: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    marginBottom: 32,
  },
  tag: {
    padding: "4px 12px",
    background: "#f3f4f6",
    borderRadius: 16,
    fontSize: 14,
    color: "#6366f1",
  },
  content: {
    display: "grid",
    gridTemplateColumns: "1fr 280px",
    gap: 40,
  },
  mainContent: {},
  sidebar: {
    padding: 20,
    background: "#f9fafb",
    borderRadius: 8,
    height: "fit-content",
  },
  readme: {
    padding: 20,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    marginBottom: 32,
  },
  noReadme: {
    color: "#666",
    fontStyle: "italic",
  },
  yamlPreview: {
    padding: 20,
    background: "#1a1a2e",
    borderRadius: 8,
    overflow: "auto",
    color: "#fff",
    fontSize: 14,
    marginBottom: 32,
  },
  versionList: {
    listStyle: "none",
    padding: 0,
    margin: "0 0 24px",
  },
  versionItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #e5e7eb",
  },
  versionNumber: {
    fontWeight: 600,
  },
  versionDate: {
    fontSize: 12,
    color: "#666",
  },
  sidebarSection: {
    marginTop: 24,
  },
  link: {
    color: "#6366f1",
    textDecoration: "none",
  },
  // Comments styles
  commentsSection: {
    marginTop: 48,
    paddingTop: 32,
    borderTop: "1px solid #e5e7eb",
  },
  commentForm: {
    marginBottom: 32,
  },
  commentInputRow: {
    display: "flex",
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    flexShrink: 0,
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    flexShrink: 0,
  },
  commentInput: {
    flex: 1,
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    fontSize: 14,
    resize: "vertical" as const,
    fontFamily: "inherit",
  },
  commentActions: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  submitButton: {
    padding: "8px 16px",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 6,
    background: "#6366f1",
    color: "#fff",
    cursor: "pointer",
  },
  signInPrompt: {
    padding: 24,
    background: "#f9fafb",
    borderRadius: 8,
    textAlign: "center" as const,
    marginBottom: 24,
  },
  signInButton: {
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 6,
    background: "#24292e",
    color: "#fff",
    cursor: "pointer",
    marginTop: 12,
  },
  noComments: {
    color: "#666",
    fontStyle: "italic",
    textAlign: "center" as const,
    padding: 24,
  },
  commentsList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 24,
  },
  commentThread: {
    borderBottom: "1px solid #e5e7eb",
    paddingBottom: 24,
  },
  comment: {
    display: "flex",
    gap: 12,
  },
  commentBody: {
    flex: 1,
  },
  commentHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  commentAuthor: {
    fontWeight: 600,
    fontSize: 14,
  },
  commentDate: {
    fontSize: 12,
    color: "#666",
  },
  commentContent: {
    fontSize: 14,
    lineHeight: 1.6,
    margin: 0,
    color: "#333",
  },
  replyButton: {
    background: "none",
    border: "none",
    color: "#6366f1",
    fontSize: 12,
    cursor: "pointer",
    padding: "4px 0",
    marginTop: 8,
  },
  replies: {
    marginLeft: 52,
    marginTop: 16,
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
    paddingLeft: 16,
    borderLeft: "2px solid #e5e7eb",
  },
  replyForm: {
    marginLeft: 52,
    marginTop: 12,
  },
  replyInput: {
    width: "100%",
    padding: 10,
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    fontSize: 14,
    resize: "vertical" as const,
    fontFamily: "inherit",
  },
  replyActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  cancelButton: {
    padding: "6px 12px",
    fontSize: 13,
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    background: "#fff",
    cursor: "pointer",
  },
};

const ManifestDetail = dynamic(() => Promise.resolve(ManifestDetailContent), { ssr: false });

export default function Page() {
  return <ManifestDetail />;
}

Page.getLayout = (page: React.ReactNode) => page;
