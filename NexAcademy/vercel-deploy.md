# SafuAcademy Vercel Deployment Guide

Deploy the full stack (Frontend + Express API) to Vercel using `serverless-http`.

---

## Architecture

We use **`serverless-http`** to wrap the existing Express app (`server.js`) into a single Vercel Serverless Function. This means:
- **No rewriting routes**: All your existing Express routes work as-is.
- **Frontend**: Served as static assets.
- **Backend**: Served serverlessly at `/api`.

---

## Step 1: Install Dependencies

Ensure `serverless-http` is installed (we did this already):

```bash
npm install serverless-http
```

---

## Step 2: Database Setup

Vercel functions are stateless, so you need an external PostgreSQL database.
- **Neon** (Free)
- **Supabase** (Free)
- **Railway** / **Aiven**

1. Get your **Connection String** (e.g., `postgresql://user:pass@host/db`).
2. Run migration locally to set up schema:
   ```bash
   cd backend
   # Set updated URL
   $env:DATABASE_URL="..." 
   npx prisma db push
   ```

---

## Step 3: Deploy to Vercel

### Option A: Vercel CLI

```bash
npm install -g vercel
vercel login
vercel
```

- When asked "Want to modify settings?", say **No**.
- It will detect `vercel.json` and build automatically.

### Option B: Git Push

1. Push your changes to GitHub/GitLab.
2. Import project in Vercel Dashboard.
3. Vercel will auto-detect the configuration.

---

## Step 4: Environment Variables (Vercel Dashboard)

Go to **Settings → Environment Variables** and add:

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | Your PostgreSQL URL | ✅ |
| `JWT_SECRET` | Secret string | ✅ |
| `JWT_EXPIRES_IN` | `7d` | No |
| `RPC_URL` | `https://bsc-dataseed.binance.org/` | ✅ |
| `CHAIN_ID` | `56` | ✅ |
| `LEVEL3_COURSE_ADDRESS` | Contract address | ✅ |
| `RELAYER_PRIVATE_KEY` | Wallet private key | ✅ |

---

## How It Works (`vercel.json`)

```json
{
  "builds": [
    { "src": "server.js", "use": "@vercel/node" },        // Backend
    { "src": "package.json", "use": "@vercel/static-build" } // Frontend
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/server.js" },        // API traffic -> serverless
    { "src": "/(.*)", "dest": "/dist/$1" }               // Other traffic -> static frontend
  ]
}
```

---

## Testing Local Build

You can simulate the Vercel environment locally:

```bash
vercel dev
```

This runs both the frontend and the serverless backend on `localhost:3000`.

---

## Troubleshooting

### "Function size too large"
- Delete `backend/node_modules` before deploying (Vercel installs its own).
- Add `.vercelignore` to exclude heavy local files.

### "Database connection error"
- Ensure `DATABASE_URL` is correct in Vercel.
- Use a pooled connection string (e.g., `pgbouncer` mode) for serverless stability.

### "Frontend 404"
- Ensure `npm run build:frontend` ran successfully during deploy.
- Check `dist` folder exists after build.

---

## Verify Deployment
- Visit `https://your-project.vercel.app` (Frontend)
- Visit `https://your-project.vercel.app/api/health` (Backend)
