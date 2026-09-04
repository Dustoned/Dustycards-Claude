export const SESSION_COOKIE_NAME = "dustycards-session";
// Persistent device sessions survive browser restarts. Sensitive admin actions
// still require recent authentication independently of this cookie lifetime.
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 90;
export const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;
export const ADMIN_REAUTH_MAX_AGE_MS = 1000 * 60 * 15;
export const MFA_REQUIRED_ERROR_CODE = "mfa_required";
export const MFA_SETUP_REQUIRED_ERROR_CODE = "mfa_setup_required";
export const REAUTH_REQUIRED_ERROR_CODE = "reauth_required";

export const ACCOUNT_APPROVAL_ERROR_CODE = "pending_approval";
export const ACCOUNT_APPROVAL_MESSAGE =
  "Your account is waiting for admin approval.";
