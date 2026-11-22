// Shared Firebase Auth Token Verifier & Admin Guard for Astro SSR & Node Dev Runtime
export {
  verifyFirebaseToken,
  requireAdmin,
  isAdminEmail,
  PRIMARY_ADMIN_EMAIL,
  type AuthenticatedUser,
} from '../../functions/api/_auth';
