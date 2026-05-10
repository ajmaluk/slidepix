import { useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { setClerkSessionContext } from "@/lib/clerkSessionStore";

function buildFullName(user: ReturnType<typeof useUser>["user"]) {
  if (!user) return "User";

  const primaryEmail = user.primaryEmailAddress?.emailAddress || user.emailAddresses[0]?.emailAddress || "";
  const parts = [user.firstName, user.lastName].filter((part): part is string => Boolean(part && part.trim()));
  const fullName = parts.join(" ").trim();

  return (
    user.fullName?.trim() ||
    fullName ||
    user.username?.trim() ||
    (primaryEmail ? primaryEmail.split("@")[0] : "User")
  );
}

export function ClerkSessionBridge() {
  const { isLoaded, isSignedIn, userId, sessionId, getToken, signOut } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (!isLoaded) {
      setClerkSessionContext({
        loading: true,
        session: null,
        getToken,
        signOut,
      });
      return;
    }

    if (!isSignedIn || !userId || !user) {
      setClerkSessionContext({
        loading: false,
        session: null,
        getToken,
        signOut,
      });
      return;
    }

    const primaryEmail = user.primaryEmailAddress?.emailAddress || user.emailAddresses[0]?.emailAddress || null;
    setClerkSessionContext({
      loading: false,
      session: {
        user: {
          id: userId,
          email: primaryEmail,
          user_metadata: {
            full_name: buildFullName(user),
            first_name: user.firstName || null,
            last_name: user.lastName || null,
            username: user.username || null,
            image_url: user.imageUrl || null,
            email: primaryEmail,
          },
        },
        access_token: "",
        session_id: sessionId || null,
      },
      getToken,
      signOut,
    });

    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;

        setClerkSessionContext({
          session: {
            user: {
              id: userId,
              email: primaryEmail,
              user_metadata: {
                full_name: buildFullName(user),
                first_name: user.firstName || null,
                last_name: user.lastName || null,
                username: user.username || null,
                image_url: user.imageUrl || null,
                email: primaryEmail,
              },
            },
            access_token: token,
            session_id: sessionId || null,
          },
        });
      } catch {
        // Token retrieval is best effort; authenticated UI still renders without it.
      }
    })();
  }, [
    getToken,
    isLoaded,
    isSignedIn,
    sessionId,
    signOut,
    user,
    userId,
  ]);

  return null;
}
