/**
 * React hooks for AIM Studio API integration
 */

import { useState, useEffect, useCallback } from "react";
import api, {
  Manifest,
  ApprovalRequest,
  AuditEvent,
  AuditSummary,
  Escalation,
  Team,
} from "./api";

interface UseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// Generic hook for API queries
function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetcher();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// Manifests
export function useManifests(): UseQueryResult<Manifest[]> {
  const result = useQuery(async () => {
    const { manifests } = await api.listManifests();
    return manifests;
  }, []);
  return result;
}

export function useManifest(id: string | null): UseQueryResult<Manifest> {
  const result = useQuery(async () => {
    if (!id) return null as unknown as Manifest;
    const { manifest } = await api.getManifest(id);
    return manifest;
  }, [id]);
  return result;
}

// Approvals
export function useApprovals(
  status?: string
): UseQueryResult<ApprovalRequest[]> {
  const result = useQuery(async () => {
    const { requests } = await api.listApprovals({ status });
    return requests;
  }, [status]);
  return result;
}

export function useApproval(id: string | null): UseQueryResult<ApprovalRequest> {
  const result = useQuery(async () => {
    if (!id) return null as unknown as ApprovalRequest;
    const { request } = await api.getApproval(id);
    return request;
  }, [id]);
  return result;
}

// Audit
export function useAuditEvents(params?: {
  type?: string;
  severity?: string;
  limit?: number;
}): UseQueryResult<AuditEvent[]> {
  const result = useQuery(async () => {
    const { events } = await api.listAuditEvents(params);
    return events;
  }, [params?.type, params?.severity, params?.limit]);
  return result;
}

export function useAuditSummary(params?: {
  startTime?: string;
  endTime?: string;
}): UseQueryResult<AuditSummary> {
  const result = useQuery(async () => {
    const { summary } = await api.getAuditSummary(params);
    return summary;
  }, [params?.startTime, params?.endTime]);
  return result;
}

// Escalations
export function useEscalations(params?: {
  status?: string;
}): UseQueryResult<Escalation[]> {
  const result = useQuery(async () => {
    const { escalations } = await api.listEscalations(params);
    return escalations;
  }, [params?.status]);
  return result;
}

// Teams
export function useTeams(): UseQueryResult<Team[]> {
  const result = useQuery(async () => {
    const { teams } = await api.listTeams();
    return teams;
  }, []);
  return result;
}

// Mutations
export function useApprovalActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const approve = useCallback(
    async (id: string, approverId: string, comment?: string) => {
      try {
        setLoading(true);
        setError(null);
        const { request } = await api.approveRequest(id, approverId, comment);
        return request;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reject = useCallback(
    async (id: string, approverId: string, comment?: string) => {
      try {
        setLoading(true);
        setError(null);
        const { request } = await api.rejectRequest(id, approverId, comment);
        return request;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { approve, reject, loading, error };
}

export function useManifestActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (name: string, content: string) => {
    try {
      setLoading(true);
      setError(null);
      const { manifest } = await api.createManifest(name, content);
      return manifest;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(async (id: string, content: string) => {
    try {
      setLoading(true);
      setError(null);
      const { manifest } = await api.updateManifest(id, content);
      return manifest;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      await api.deleteManifest(id);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const validate = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.validateManifest(id);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, update, remove, validate, loading, error };
}

export function useEnforce() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const enforce = useCallback(
    async (manifestId: string, content: string, filePath: string) => {
      try {
        setLoading(true);
        setError(null);
        const { result } = await api.enforce(manifestId, content, filePath);
        return result;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { enforce, loading, error };
}
