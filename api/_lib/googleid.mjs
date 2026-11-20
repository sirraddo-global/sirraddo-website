// The Google Client ID from Netlify, cleaned of stray spaces, line breaks and quotes from copying; anything that
// isn't a real Client ID (e.g. the secret, GOCSPX-…) is ignored so stores show no broken Google button.
export function googleClientId(raw = process.env.GOOGLE_SIGNIN_CLIENT_ID) {
  const v = String(raw || "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  return /^[0-9A-Za-z-]+\.apps\.googleusercontent\.com$/.test(v) ? v : null;
}
