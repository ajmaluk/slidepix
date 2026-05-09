export type ClerkStoredUser = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
};

export type ClerkStoredSession = {
  user: ClerkStoredUser;
  access_token: string;
  session_id: string | null;
};

export type ClerkSessionSnapshot = {
  session: ClerkStoredSession | null;
  loading: boolean;
};

type AuthListener = (snapshot: ClerkSessionSnapshot) => void;

let snapshot: ClerkSessionSnapshot = {
  session: null,
  loading: false,
};

let getTokenResolver: null | (() => Promise<string | null>) = null;
let signOutResolver: null | (() => Promise<void>) = null;
const listeners = new Set<AuthListener>();

function emit(next: ClerkSessionSnapshot) {
  if (snapshot.session === next.session && snapshot.loading === next.loading) {
    return;
  }

  snapshot = next;
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function cloneSession(session: ClerkStoredSession | null): ClerkStoredSession | null {
  if (!session) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      user_metadata: { ...session.user.user_metadata },
    },
    access_token: session.access_token,
    session_id: session.session_id,
  };
}

export function getClerkSessionSnapshot(): ClerkSessionSnapshot {
  return snapshot;
}

export function subscribeClerkSession(listener: AuthListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setClerkSessionContext(next: {
  session?: ClerkStoredSession | null;
  loading?: boolean;
  getToken?: null | (() => Promise<string | null>);
  signOut?: null | (() => Promise<void>);
}) {
  if (Object.prototype.hasOwnProperty.call(next, "getToken")) {
    getTokenResolver = next.getToken ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(next, "signOut")) {
    signOutResolver = next.signOut ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(next, "session") || Object.prototype.hasOwnProperty.call(next, "loading")) {
    emit({
      session: cloneSession(next.session ?? snapshot.session),
      loading: next.loading ?? snapshot.loading,
    });
  }
}

export function clearClerkSessionContext() {
  getTokenResolver = null;
  signOutResolver = null;
  emit({ session: null, loading: false });
}

export async function refreshClerkSession(forceRefresh = false): Promise<ClerkStoredSession | null> {
  const current = snapshot.session;
  if (!current) return null;

  if (!forceRefresh && current.access_token) {
    return cloneSession(current);
  }

  if (!getTokenResolver) {
    return cloneSession(current);
  }

  try {
    const token = await getTokenResolver();
    if (!token) return cloneSession(current);

    const next = {
      ...current,
      access_token: token,
    };

    emit({
      session: cloneSession(next),
      loading: snapshot.loading,
    });

    return cloneSession(next);
  } catch {
    return cloneSession(current);
  }
}

export async function signOutClerkSession(): Promise<void> {
  if (signOutResolver) {
    await signOutResolver();
    return;
  }

  clearClerkSessionContext();
}

