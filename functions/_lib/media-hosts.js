const ALLOWED_MEDIA_DOMAINS = [
  "tiktok.com",
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokcdn-eu.com",
  "tiktokcdn-in.com",
  "tiktokv.com",
  "byteoversea.com",
  "ibytedtos.com",
  "tikwm.com"
];

export function isAllowedMediaUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return ALLOWED_MEDIA_DOMAINS.some(domain => host === domain || host.endsWith("." + domain));
  } catch {
    return false;
  }
}
