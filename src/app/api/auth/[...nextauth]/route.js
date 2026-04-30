import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '@/lib/db';

export const authOptions = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error:  '/login',
  },
  providers: [
    // ── Email + Password ──────────────────────────────────────
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const company = await queryOne(
          `SELECT company_id, name, email, password_hash, logo_url
           FROM companies WHERE LOWER(email) = LOWER(:email) AND is_active = 1`,
          { email: credentials.email }
        );

        if (!company || !company.PASSWORD_HASH) return null;

        const valid = await bcrypt.compare(credentials.password, company.PASSWORD_HASH);
        if (!valid) return null;

        return {
          id:        String(company.COMPANY_ID), // NextAuth requires `id` to be a string
          companyId: company.COMPANY_ID,
          name:      company.NAME,
          email:     company.EMAIL,
          image:     company.LOGO_URL ?? null,
        };
      },
    }),

    // ── Google OAuth ──────────────────────────────────────────
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  callbacks: {
    // 1. signIn is strictly for access control and database upserts
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        try {
          let company = await queryOne(
            `SELECT company_id FROM companies WHERE google_id = :gid OR LOWER(email) = LOWER(:email)`,
            { gid: user.id, email: user.email }
          );

          if (!company) {
            // New Google user → auto-register company
            await query(
              `INSERT INTO companies (name, email, google_id, logo_url, is_active)
               VALUES (:name, :email, :gid, :logo, 1)`,
              { name: user.name, email: user.email, gid: user.id, logo: user.image ?? null }
            );
          } else {
            // Update google_id and logo if logging in via email match
            await query(
              `UPDATE companies SET google_id = :gid, logo_url = :logo WHERE company_id = :cid`,
              { gid: user.id, logo: user.image ?? null, cid: company.COMPANY_ID }
            );
          }
          return true; // Allow login
        } catch (err) {
          console.error('Google signIn error:', err);
          return false; // Deny login if DB fails
        }
      }
      return true; // Allow login for credentials
    },

    // 2. jwt attaches custom claims to the token
    async jwt({ token, user, account }) {
      // The `user` and `account` objects are only present on the very first login request
      if (account?.provider === 'google') {
        // Because NextAuth drops custom properties mutated in `signIn`, 
        // we fetch the DB company record to get the companyId for the token.
        const company = await queryOne(
          `SELECT company_id FROM companies WHERE LOWER(email) = LOWER(:email)`,
          { email: token.email }
        );
        
        if (company) {
          token.companyId = company.COMPANY_ID;
        }
      } else if (user) {
        // For credentials login, `user` contains the object returned from `authorize`
        token.companyId = user.companyId;
      }
      
      return token;
    },

    // 3. session exposes the token claims to the frontend client
    async session({ session, token }) {
      if (token?.companyId) {
        session.user.companyId = token.companyId;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };