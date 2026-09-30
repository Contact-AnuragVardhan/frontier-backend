# AI Choice Backend - Render Deployment

This project is a standard Node.js/Express web service prepared for Render deployment.

## Runtime

- Node.js 20+
- Express server entry point: `src/server.js`
- Health endpoint: `GET /health`
- API routes remain unchanged.

## Local development

1. Copy `.env.example` to `.env` and fill in the required values.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the API:

   ```bash
   npm run dev
   ```

Default local health URL:

```text
http://localhost:4000/health
```

## Deploy to Render

Create a **Web Service** from this repository/project.

Use these settings:

```text
Runtime: Node
Build Command: npm ci
Start Command: npm start
Health Check Path: /health
```

Render supplies the `PORT` environment variable automatically. The application also defaults to port `4000` for local development.

Add the environment variables from `.env.example` in the Render service's Environment settings. Do not commit your real `.env` file.

A `render.yaml` file is included if you prefer to create the service using a Render Blueprint.

## Routes

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

If the Resend sender/domain is not ready yet, set:

```text
EMAIL_NOTIFICATIONS_ENABLED=false
```

Enable email later after `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, and the form recipient variables are configured.

## Parent Chapter form setup

Before enabling the Parent Chapter form in production:

1. Run `sql/05_parent_chapter_submission.sql` in Supabase.
2. Configure `PARENT_CHAPTER_TO_EMAIL` in Render.

Optional `PARENT_CHAPTER_EMAIL_*` environment variables can override the built-in subject/text/HTML templates documented in `.env.example`.
