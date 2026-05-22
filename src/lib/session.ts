import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth";

export interface SessionWithToken {
  user?: {
    id?: string;
    githubId?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  accessToken?: string;
}

export async function getServerSessionWithToken(): Promise<SessionWithToken | null> {
  const session = await getServerSession(authOptions);
  return session as SessionWithToken | null;
}
