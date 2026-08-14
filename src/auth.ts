import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { generateApiKey } from "@/lib/api-keys";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Google OAuth is optional: only enabled when credentials are configured.
const googleId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
const googleProvider =
  googleId && googleSecret
    ? Google({ clientId: googleId, clientSecret: googleSecret })
    : null;

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Required so Auth.js works behind Vercel's proxy on deploy.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // One pipeline for both admins and customers: the platform owner's
      // account lives in the Admin table, everyone else in Customer.
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const lower = email.toLowerCase();

        const admin = await prisma.admin.findUnique({ where: { email: lower } });
        if (admin && (await bcrypt.compare(password, admin.passwordHash))) {
          return { id: admin.id, email: admin.email, name: admin.name, role: "admin" };
        }

        const customer = await prisma.customer.findUnique({ where: { email: lower } });
        if (!customer?.passwordHash) return null;
        if (await bcrypt.compare(password, customer.passwordHash)) {
          return { id: customer.id, email: customer.email, name: customer.name, role: "customer" };
        }

        return null;
      },
    }),
    ...(googleProvider ? [googleProvider] : []),
  ],
  callbacks: {
    // Auto-provision a customer account (with a fresh API key) the first time
    // someone signs in with Google.
    signIn: async ({ user, account }) => {
      if (account?.provider === "google" && user.email) {
        const email = user.email.toLowerCase();
        const admin = await prisma.admin.findUnique({ where: { email } });
        if (admin) return true;

        const existing = await prisma.customer.findUnique({ where: { email } });
        if (!existing) {
          const { hash, lookup, masked } = await generateApiKey("sandbox");
          const customer = await prisma.customer.create({
            data: {
              email,
              name: user.name ?? null,
              apiKeyHash: hash,
              apiKeyLookup: lookup,
              apiKeyPrefix: masked,
            },
          });
          await logAudit({
            actorId: customer.id,
            action: "customer.signed_up",
            entity: "customer",
            entityId: customer.id,
            details: `email=${email}, provider=google`,
          });
        }
      }
      return true;
    },
    jwt: async ({ token, user, account }) => {
      if (user) {
        if (account?.provider === "google") {
          // Resolve the role once at sign-in (the customer row was just
          // provisioned above, or already existed).
          const email = (user.email ?? "").toLowerCase();
          const admin = await prisma.admin.findUnique({ where: { email } });
          if (admin) {
            token.id = admin.id;
            token.role = "admin";
          } else {
            const customer = await prisma.customer.findUnique({ where: { email } });
            token.id = customer?.id ?? "";
            token.role = "customer";
          }
        } else {
          // Credentials: authorize already set these on the returned user.
          // authjs types the callback params against @auth/core's own types,
          // which don't know about our extra fields — cast explicitly.
          const u = user as { id?: string; role?: string };
          token.id = u.id ?? "";
          token.role = u.role ?? "customer";
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        const extended = session.user as { id?: string; role?: string };
        extended.id = (token as { id?: string }).id ?? "";
        extended.role = (token as { role?: string }).role ?? "customer";
      }
      return session;
    },
  },
});
