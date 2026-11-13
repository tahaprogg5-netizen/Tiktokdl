# TikTokDL

A minimal Persian/English TikTok-only link interface for Cloudflare Pages.

## Features
- TikTok-only URL form
- Dedicated advertisement banner placeholder
- Hidden admin entry (tap the brand logo five times), protected by ADMIN_PASSWORD
- Dark/light theme and Persian/English language selection (saved in the visitor's browser)
- No daily download quota
- D1 statistics for admin dashboard

## Cloudflare Pages
Build command: npm run build
Output directory: dist
Root directory: /

Set the production secret ADMIN_PASSWORD in Workers & Pages > tiktokdl > Settings > Variables and Secrets. D1 binding DB is configured in wrangler.toml.

Note: theme and language choices are currently per-browser preferences. The ad area is a placeholder; add the actual creative/link when available. TikTok endpoints and third-party APIs may change, so the downloader API needs live testing after deployment.