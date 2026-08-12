import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "./prisma";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

/** Google OAuth is only wired up when both credentials are present. */
export const hasGoogleAuth = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

/**
 * Demo sign-in: pick any seeded account without a password.
 *
 * HACKATHON CUT CORNER. It exists so the app is demoable with zero OAuth
 * setup, and it disappears the moment GOOGLE_CLIENT_ID/SECRET are configured.
 * Never deploy this publicly without Google credentials set.
 */
export const allowDemoLogin = !hasGoogleAuth;

const providers = [];

if (hasGoogleAuth) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (allowDemoLogin) {
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo account",
      credentials: { email: { label: "Email", type: "text" } },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        if (!email) return null;

        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            name: email.split("@")[0],
            role: "BOTH",
          },
        });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT sessions so the demo Credentials provider can coexist with the adapter.
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
        token.role = dbUser?.role ?? "SEEKER";
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
