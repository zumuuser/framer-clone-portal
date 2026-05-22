declare module "next-auth" {
  interface Session {
    accessToken?: string;
    user: {
      id: string;
      githubId?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface Profile {
    id: string | number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    githubId?: string;
  }
}
