# MultiDL

Minimal Persian RTL static site for Cloudflare Pages.

## Current scope
- Static website; no database and no account system.
- Unlimited use; no daily quota.
- Accepts direct HTTP(S) media-file links that the visitor owns or is authorized to access.
- Does not scrape social platforms, bypass access controls, or remove watermarks.

## Deploy to Cloudflare Pages

Cloudflare Pages build settings: command `npm run build`, output directory `dist`, root directory `/`. The repository includes `wrangler.toml` for the D1 binding.
1. In Cloudflare Dashboard, open **Workers & Pages**.
2. Create a Pages project and connect this GitHub repository.
3. Framework preset: **None**.
4. Build command: leave empty.
5. Build output directory: `/`.
6. Deploy.

The site is static, so no database or environment variables are required.

## Notes
The current version validates direct media-file URL formats and offers a link to open the file. It does not proxy or host files. Persistent analytics and a secure admin panel require an external analytics service or server-side storage; neither is included in this no-database version.
