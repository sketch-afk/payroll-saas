import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// Use in Server Components / API routes
export async function getSession() {
  return getServerSession(authOptions);
}

// Returns company_id from session or throws 401
export async function requireCompany() {
  const session = await getSession();
  if (!session?.user?.companyId) {
    throw new Error('UNAUTHORIZED');
  }
  return Number(session.user.companyId);
}

// Helper for API routes
export function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export function badRequest(msg) {
  return Response.json({ error: msg }, { status: 400 });
}

export function serverError(err) {
  console.error(err);
  return Response.json({ error: err?.message ?? 'Server error' }, { status: 500 });
}
