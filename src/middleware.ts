import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    // Allow authenticated users through
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized({ req, token }) {
        // Protect dashboard and project routes
        if (req.nextUrl.pathname.startsWith("/dashboard") || req.nextUrl.pathname.startsWith("/projects")) {
          return token !== null;
        }
        // Public routes
        return true;
      },
    },
    pages: {
      signIn: "/",
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*"],
};
