# SafuAcademy cPanel Deployment Guide

Complete guide to deploy **both the frontend AND backend** on cPanel.

---

## What Gets Deployed

| Component | Location | Purpose |
|-----------|----------|---------|
| `server.js` | Root | Main entry point |
| `/dist` | Root | Built Vite frontend |
| `/backend/dist` | Root | Compiled Express API |
| `/backend/node_modules` | Root | Backend dependencies |

---

## Prerequisites

- cPanel with **Node.js Selector** / Application Manager
- **PostgreSQL database** (Aiven, Supabase, or cPanel PostgreSQL)
- SSH access (recommended)

---

## Step 1: Build Everything Locally

```bash
cd c:\Users\PC\Safuverse\SafuAcademy

# Build frontend
npm run build:frontend

# Build backend (compiles TypeScript)
npm run build:backend

# Copy frontend dist to root
npm run copy:dist
```

Verify these folders/files exist:
- ✅ `/dist/index.html`
- ✅ `/backend/dist/index.js`

---

## Step 2: Create .env File

Create `.env` in the **root folder** (copy from backend):

```env
# Database (REQUIRED)
DATABASE_URL="postgresql://user:password@host:port/dbname?schema=public"

# JWT (REQUIRED)
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_EXPIRES_IN="7d"

# Blockchain
RPC_URL="https://bsc-dataseed.binance.org/"
CHAIN_ID=56
LEVEL3_COURSE_ADDRESS="0x..."
RELAYER_PRIVATE_KEY="0x..."

# Server
NODE_ENV="production"
CORS_ORIGINS="https://yourdomain.com,https://www.yourdomain.com"
```

---

## Step 3: Upload Files to cPanel

Upload these to your app folder (e.g., `/home/user/safuacademy/`):

```
/home/user/safuacademy/
├── server.js           ← Main entry
├── package.json
├── package-lock.json
├── .env                ← Your environment variables
├── dist/               ← Built frontend
│   ├── index.html
│   └── assets/
├── backend/
│   ├── dist/           ← Compiled backend (IMPORTANT!)
│   │   ├── index.js
│   │   ├── routes/
│   │   ├── services/
│   │   └── ...
│   ├── node_modules/   ← Backend dependencies
│   └── package.json
└── node_modules/       ← Root dependencies (express, cors, dotenv)
```

### Quick Upload via ZIP

1. Create ZIP of all above files
2. Upload via cPanel File Manager
3. Extract in target folder

---

## Step 4: Setup Node.js Application in cPanel

1. Go to **Setup Node.js App** or **Node.js Selector**
2. Click **Create Application**
3. Configure:

| Setting | Value |
|---------|-------|
| **Node.js version** | 18.x or 20.x |
| **Application mode** | Production |
| **Application root** | `/home/user/safuacademy` |
| **Application URL** | Your domain |
| **Application startup file** | `server.js` |

4. Click **Create**

---

## Step 5: Install Dependencies via SSH

```bash
# SSH into your server
ssh user@yourdomain.com

# Navigate to app
cd /home/user/safuacademy

# Install root dependencies
npm install --production

# Install backend dependencies
cd backend
npm install --production

# Generate Prisma client
npx prisma generate
```

---

## Step 6: Start Application

1. In cPanel Node.js App panel, click **Restart**
2. Or via SSH: `touch tmp/restart.txt`

---

## Verification

### Check Health Endpoint
```bash
curl https://yourdomain.com/api/health
```

Expected response:
```json
{
  "ok": true,
  "timestamp": "2025-12-13T...",
  "env": "production",
  "database": "connected",
  "backend": "loaded"
}
```

### Check Frontend
Visit `https://yourdomain.com/` - should show SafuAcademy homepage.

### Check API
```bash
# Get nonce for wallet
curl -X POST https://yourdomain.com/api/auth/nonce \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0x..."}'
```

---

## Environment Variables in cPanel

In the Node.js App panel, add these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret for JWT (min 32 chars) |
| `JWT_EXPIRES_IN` | No | Token expiry (default: 7d) |
| `RPC_URL` | ✅ | BSC RPC endpoint |
| `CHAIN_ID` | No | 56 for BSC |
| `LEVEL3_COURSE_ADDRESS` | ✅ | Smart contract address |
| `RELAYER_PRIVATE_KEY` | ✅ | Wallet private key for gas |
| `CORS_ORIGINS` | Yes | Your domain(s) |
| `NODE_ENV` | No | production |

---

## API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/nonce` | Get sign nonce |
| POST | `/api/auth/verify` | Verify signature → JWT |
| GET | `/api/courses` | List courses |
| POST | `/api/courses/:id/enroll` | Enroll in course |
| POST | `/api/lessons/:id/complete` | Complete lesson |
| GET | `/api/user/profile` | Get user profile |
| GET | `/api/health` | Health check |

---

## Troubleshooting

### "Backend not compiled"
```bash
cd backend && npm run build
```

### "Cannot find module '@prisma/client'"
```bash
cd backend && npx prisma generate
```

### "Database connection failed"
- Verify `DATABASE_URL` is correct
- Check database is accessible from cPanel server
- Ensure SSL settings match your database

### 502 Bad Gateway
- Check `stderr.log` in app folder
- Verify Node.js version compatibility
- Run `npm install` again

### Check Logs
```bash
cd /home/user/safuacademy
cat stderr.log
tail -f stderr.log  # Live logs
```

---

## Quick Reference

```bash
# Local build commands
npm run build:frontend
npm run build:backend  
npm run copy:dist
npm start  # Test locally

# Server commands (SSH)
cd /home/user/safuacademy
npm install --production
cd backend && npm install --production && npx prisma generate
touch ../tmp/restart.txt  # Restart app
```
