import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "./prisma";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

/**
 * Google is the only way in. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are
 * required: there is no passwordless demo provider behind this, so sign-in
 * fails loudly rather than handing out seeded accounts.
 *
 * Read at request time by NextAuth, not asserted at import, so `next build`
 * still works in an environment without the secrets.
 */
const providers = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    allowDangerousEmailAccountLinking: true,
  }),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT sessions: the role is re-read from the database in the jwt callback
  // below, so a role change takes effect without a new sign-in.
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers,
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      if (token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true },
        });
        // The row can vanish under a live session (account deleted, or the
        // database reseeded). Invalidate rather than hand back a session
        // pointing at a missing user, which would fail on the first write.
        if (!dbUser) return null;
        token.role = dbUser.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.role = (token.role as Role) ?? "SEEKER";
      return session;
    },
  },
});

/** Session user or null. Use in server components and server actions. */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
}

/** Throws when signed out. Use to guard mutations. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to do that.");
  return user;
}
