# AI Choice Backend - Netlify Manual Deployment

This project keeps the existing Express backend and adds a Netlify Functions adapter.

## Project layout

- `src/app.js` - Express app without `listen()`
- `src/server.js` - local Node entry point
- `netlify/functions/api.mjs` - Netlify Function wrapper
- `netlify.toml` - Netlify functions, publish directory, and rewrites
- `public/index.html` - simple static landing page for the API project

## One-time setup

1. Keep your existing local `.env` file in the project root. It is intentionally not included in this ZIP.
2. Install dependencies (this also creates a new `package-lock.json`):

   ```bash
   npm install
   ```

3. Install Netlify CLI once if it is not already installed:

   ```bash
   npm install -g netlify-cli
   ```

4. Log in and link/create the backend Netlify project:

   ```bash
   netlify login
   netlify link
   ```

5. Add the production environment variables in the Netlify project settings. Do not upload your `.env` as public site content.

## Local development

Normal Express development:

```bash
npm run dev
```

Default local URL:

```text
http://localhost:4000/health
```

Test through the Netlify environment:

```bash
npm run netlify:dev
```

Typical URL:

```text
http://localhost:8888/health
```

## Build locally

```bash
npm run build
```

This runs `netlify build` locally. Unlike the React/Vite frontend, the backend does not produce a single static `dist` folder; Netlify Functions are packaged by Netlify CLI.

## Preview deploy

```bash
npm run deploy:preview
```

## Production deploy

```bash
npm run deploy
```

## Routes

The existing public routes remain unchanged:

- `GET /health`
- `GET /api/policies`
- `GET /api/policies/:id`
- `GET /api/policies/options`
- `POST /api/chat`
- `GET /api/chat/status`
- `POST /api/site/contact`
- `POST /api/site/newsletter`
- `POST /api/site/parent-chapter`

## Email setup

If the Resend sender/domain is not ready yet, set this in the Netlify environment variables:

```text
EMAIL_NOTIFICATIONS_ENABLED=false
```

Then enable email later after `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, and recipient variables are configured.

## Parent Chapter form setup

Before enabling the Parent Chapter form in production:

1. Run `sql/05_parent_chapter_submission.sql` in Supabase. This extends the existing `site_submissions` table without changing existing Contact/newsletter rows.
2. Add this backend-only Netlify environment variable:

```text
PARENT_CHAPTER_TO_EMAIL=juliabutch23@gmail.com
```

Optional `PARENT_CHAPTER_EMAIL_*` environment variables can override the built-in subject/text/HTML templates documented in `.env.example`. Do not expose the recipient through a `VITE_` variable.
