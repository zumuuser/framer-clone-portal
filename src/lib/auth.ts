import GithubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    async jwt({ token, account, profile }: { token: any; account: any; profile: any }) {
      if (account && profile) {
        token.accessToken = account.access_token;
        token.githubId = String(profile.id);
      }
      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      if (token) {
        session.user.id = token.sub;
        session.user.githubId = token.githubId;
        session.accessToken = token.accessToken;
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account, profile }: { user: any; account: any; profile: any }) {
      if (account && profile) {
        await prisma.user.update({
          where: { email: user.email! },
          data: {
            githubToken: account.access_token,
            githubId: String(profile.id),
          },
        });
      }
    },
  },
};
