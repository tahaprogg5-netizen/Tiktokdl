# TikTokDL

A minimal Persian/English TikTok-only link interface for Cloudflare Pages.

## Features
- TikTok-only URL form (including public short links)
- Cloudflare Pages Functions API
- Video preview and streamed downloads through a restricted media proxy
- Advertisement management backed by D1
- Hidden admin entry (tap the brand logo five times), protected by the Cloudflare `ADMIN_PASSWORD` secret
- Dark/light theme and Persian/English language selection (saved in the visitor's browser)
- Custom public pages managed from the admin page builder
- No daily download quota
- D1 statistics and persistent filename sequence

## Cloudflare Pages
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: `/`
- D1 binding name: `DB`
- Production secret: `ADMIN_PASSWORD`

The complete D1 schema is in `schema.sql`. It includes download statistics, the filename sequence, ads, and custom pages. The sequence is initialized with `INSERT OR IGNORE`, so reapplying the schema does not reset existing numbering.

## TikTok resolver

The repository `BOTCAHX/tiktokdl-api` defines `/tiktok/api.php` as a route on an instance of that Koa application; it is not a public endpoint on the resolver host. That application calls the `btch-downloader` client, whose resolver endpoint is `/ttdl?url=...` on its configured backend.

This Pages Function calls `https://backend1.tioo.eu.org/ttdl?url=...` directly. The base URL can be overridden with the non-secret Pages environment variable `TIKTOK_API_BASE` (origin or base path, without the `/ttdl` suffix). The resolver is an external dependency; if its operator changes the API or blocks requests, extraction can fail even when this Pages deployment is healthy.

Only public videos should be processed, and users should download content only when they have permission to do so.
