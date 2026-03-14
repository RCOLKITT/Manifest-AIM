import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jhwfncfwmpttwfcyiefk.supabase.co";
// Get your anon key from Supabase Dashboard > Settings > API
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

type AuthState = "loading" | "sign-in" | "completing" | "success" | "error";

export default function CLIAuth() {
  const [state, setState] = useState<AuthState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    // Get session ID from URL
    const params = new URLSearchParams(window.location.search);
    const session = params.get("session");

    if (!session || session.length < 16) {
      setError("Invalid or missing session ID. Please run 'manifest login' again.");
      setState("error");
      return;
    }

    setSessionId(session);

    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session: authSession } }) => {
      if (authSession) {
        // Already logged in, complete the auth
        completeAuth(session, authSession.access_token);
      } else {
        setState("sign-in");
      }
    });
  }, []);

  const completeAuth = async (session: string, accessToken: string) => {
    setState("completing");

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/auth-complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ session_id: session }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to complete authentication");
      }

      setState("success");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (data.session && sessionId) {
        await completeAuth(sessionId, data.session.access_token);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      if (data.session && sessionId) {
        await completeAuth(sessionId, data.session.access_token);
      } else {
        setError("Please check your email to confirm your account, then try signing in.");
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleOAuth = async (provider: "github" | "google") => {
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/cli?session=${sessionId}`,
      },
    });

    if (authError) {
      setError(authError.message);
    }
  };

  if (state === "loading") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.spinner} />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successIcon}>✓</div>
          <h1 style={styles.title}>Authentication Complete</h1>
          <p style={styles.subtitle}>
            You can close this window and return to your terminal.
          </p>
          <p style={styles.hint}>
            The CLI should automatically detect your login.
          </p>
        </div>
      </div>
    );
  }

  if (state === "completing") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.spinner} />
          <p>Completing authentication...</p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.errorIcon}>✗</div>
          <h1 style={styles.title}>Authentication Failed</h1>
          <p style={styles.error}>{error}</p>
          <p style={styles.hint}>
            Please run <code>manifest login</code> again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <img src="/logo.svg" alt="Manifest AIM" style={{ height: 48 }} />
        </div>
        <h1 style={styles.title}>Sign in to Manifest AIM</h1>
        <p style={styles.subtitle}>Authenticate your CLI</p>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.oauthButtons}>
          <button onClick={() => handleOAuth("github")} style={styles.oauthButton}>
            <GithubIcon /> Continue with GitHub
          </button>
          <button onClick={() => handleOAuth("google")} style={styles.oauthButton}>
            <GoogleIcon /> Continue with Google
          </button>
        </div>

        <div style={styles.divider}>
          <span>or</span>
        </div>

        <form onSubmit={handleSignIn} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            required
          />
          <button type="submit" style={styles.primaryButton}>
            Sign In
          </button>
          <button type="button" onClick={handleSignUp} style={styles.secondaryButton}>
            Create Account
          </button>
        </form>
      </div>
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" style={{ marginRight: 8 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
    padding: 20,
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 40,
    maxWidth: 400,
    width: "100%",
    textAlign: "center",
    boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
  },
  logo: {
    marginBottom: 24,
  },
  title: {
    margin: "0 0 8px",
    fontSize: 24,
    fontWeight: 600,
    color: "#1a1a2e",
  },
  subtitle: {
    margin: "0 0 24px",
    color: "#666",
    fontSize: 14,
  },
  oauthButtons: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 24,
  },
  oauthButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 16px",
    border: "1px solid #ddd",
    borderRadius: 8,
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    transition: "background 0.2s",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
    color: "#999",
    fontSize: 12,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  input: {
    padding: "12px 16px",
    border: "1px solid #ddd",
    borderRadius: 8,
    fontSize: 14,
    outline: "none",
  },
  primaryButton: {
    padding: "12px 16px",
    border: "none",
    borderRadius: 8,
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "12px 16px",
    border: "1px solid #ddd",
    borderRadius: 8,
    background: "#fff",
    color: "#666",
    fontSize: 14,
    cursor: "pointer",
  },
  errorBox: {
    padding: 12,
    marginBottom: 16,
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    color: "#dc2626",
    fontSize: 14,
  },
  successIcon: {
    width: 64,
    height: 64,
    margin: "0 auto 16px",
    borderRadius: "50%",
    background: "#10b981",
    color: "#fff",
    fontSize: 32,
    lineHeight: "64px",
  },
  errorIcon: {
    width: 64,
    height: 64,
    margin: "0 auto 16px",
    borderRadius: "50%",
    background: "#ef4444",
    color: "#fff",
    fontSize: 32,
    lineHeight: "64px",
  },
  hint: {
    color: "#666",
    fontSize: 14,
  },
  error: {
    color: "#dc2626",
    fontSize: 14,
    marginBottom: 16,
  },
  spinner: {
    width: 32,
    height: 32,
    margin: "0 auto 16px",
    border: "3px solid #e5e7eb",
    borderTop: "3px solid #6366f1",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
};
