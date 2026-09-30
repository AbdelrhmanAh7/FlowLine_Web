export const en = {
  verify: { subject: "Verify your Flowline email", title: "Verify your email", body: "Use the button to verify your email. This link expires in 24 hours.", action: "Verify email", why: "You received this because you created a Flowline account." },
  reset: { subject: "Reset your password", title: "Reset your password", body: "Use this link to set a new password. It expires in 30 minutes.", action: "Reset password", why: "You received this because someone requested a password reset for your account." },
  invite: { subject: "Invitation to a Flowline workspace", title: "Workspace invitation", body: "You have been invited to join a Flowline workspace. This invitation expires in 7 days.", action: "View invitation", why: "You received this because a workspace member invited you." },
  delete: { subject: "Confirm Flowline account deletion", title: "Confirm account deletion", body: "Confirming will delete your account. This link expires in 30 minutes.", action: "Confirm deletion", why: "You received this because you requested account deletion." },
  passwordChanged: { subject: "Your password changed", title: "Password changed", body: "Your account password changed. If this was not you, contact support immediately.", action: "Open Flowline", why: "This is a security notice for your account." },
  emailVerified: { subject: "Your email is verified", title: "Email verified", body: "Your email address is now verified.", action: "Open Flowline", why: "This is a security notice for your account." },
  emailChanged: { subject: "Your account email changed", title: "Email changed", body: "Your account email address changed. If this was not you, contact support immediately.", action: "Open Flowline", why: "This is a security notice for your account." },
  fallback: "If the button does not work, copy this link:", ignore: "If you did not request this, you can ignore this message.",
} as const;
