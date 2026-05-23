import GithubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";

export const authOptions: any = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "read:user user:email repo",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, profile }: any) {
      if (account) {
        token.accessToken = account.access_token;
      }
      if (profile?.id) {
        token.githubId = String(profile.id);
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token) {
        session.user.id = token.sub;
        session.user.githubId = token.githubId;
        session.accessToken = token.accessToken;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account, profile }: any) {
      if (!account || !user?.email) return;

      try {
        await prisma.user.update({
          where: { email: user.email },
          data: {
            githubToken: account.access_token,
            ...(profile?.id ? { githubId: String(profile.id) } : {}),
          },
        });
      } catch (err) {
        console.error("Failed to update user after sign in:", err);
      }
    },
  },
};
