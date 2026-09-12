export interface ForgotPasswordEmailData {
  /** The 6-digit one-time password the user must enter on the reset-password page. */
  otp: string;
  /** Deep link to the frontend's reset-password page (email prefilled). */
  resetUrl: string;
  /** How many minutes until the OTP (and therefore this link) expires. */
  otpExpiresInMinutes: number;
}

export const FORGOT_PASSWORD_EMAIL_SUBJECT =
  'Reset your Ordara Analytics password';

/**
 * Renders the forgot-password email as a single self-contained HTML string.
 *
 * Deliberately table-based with inline styles only (no external stylesheet,
 * flexbox or grid) — that's what keeps a brand email rendering consistently
 * across Outlook, Gmail and other common email clients.
 */
export function buildForgotPasswordEmailHtml({
  otp,
  resetUrl,
  otpExpiresInMinutes,
}: ForgotPasswordEmailData): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0; padding:0; background-color:#E4E7F4; font-family: Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#E4E7F4; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px; width:100%; background-color:#FFFFFF; border:1px solid #D9DCE8; border-radius:8px;">
            <!-- Brand header -->
            <tr>
              <td align="center" style="background-color:#08216A; padding:24px; border-radius:8px 8px 0 0;">
                <span style="color:#FFFFFF; font-size:20px; font-weight:bold; letter-spacing:0.5px;">Ordara Analytics</span>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px; color:#08216A; font-size:22px; line-height:1.3; font-weight:bold;">
                  Reset Your Password
                </h1>
                <p style="margin:0 0 24px; color:#42465A; font-size:15px; line-height:1.6;">
                  We received a request to reset the password for your Ordara Analytics account. Use the one-time code below, or click the button to open the reset page.
                </p>

                <!-- OTP -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td align="center" style="background-color:#EAF5FA; border:1px solid #D9DCE8; border-radius:6px; padding:16px;">
                      <span style="display:block; color:#42465A; font-size:13px; margin-bottom:4px;">Your one-time code</span>
                      <span style="display:block; color:#08216A; font-size:28px; font-weight:bold; letter-spacing:6px;">${otp}</span>
                    </td>
                  </tr>
                </table>

                <!-- CTA button -->
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                  <tr>
                    <td align="center" style="background-color:#00A0C6; border-radius:6px;">
                      <a
                        href="${resetUrl}"
                        target="_blank"
                        style="display:inline-block; padding:14px 32px; color:#FFFFFF; font-size:15px; font-weight:bold; text-decoration:none; border-radius:6px;"
                      >
                        Reset Password
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Fallback link -->
                <p style="margin:0 0 24px; color:#42465A; font-size:13px; line-height:1.6;">
                  If the button above doesn't work, copy and paste this link into your browser:<br />
                  <a href="${resetUrl}" style="color:#00A0C6; word-break:break-all;">${resetUrl}</a>
                </p>

                <p style="margin:0 0 24px; color:#42465A; font-size:13px; line-height:1.6;">
                  This code and link expire in ${otpExpiresInMinutes} minutes.
                </p>

                <!-- Security note -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#E4E7F4; border-radius:6px; padding:12px 16px;">
                      <span style="color:#42465A; font-size:12px; line-height:1.6;">
                        If you didn't request a password reset, you can safely ignore this email — your password will not be changed.
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <p style="margin:16px 0 0; color:#8A8FA3; font-size:11px;">
            &copy; ${new Date().getFullYear()} Ordara Analytics. All rights reserved.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
