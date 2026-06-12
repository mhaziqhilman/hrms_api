# VPS Migration Guide — HRMS Backend (Render → Self-Managed VPS)

Comprehensive runbook for deploying the HRMS API on a self-managed Linux VPS, replacing the previous Render deployment. Covers initial provisioning, software install, code deployment, reverse-proxy + HTTPS, process management, OAuth/email migration, and post-deploy verification.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [VPS Provisioning](#3-vps-provisioning)
4. [Initial Server Setup](#4-initial-server-setup)
5. [Install Runtime Stack](#5-install-runtime-stack)
6. [Deploy the Application](#6-deploy-the-application)
7. [Process Management with PM2](#7-process-management-with-pm2)
8. [Domain & DNS Configuration](#8-domain--dns-configuration)
9. [Nginx Reverse Proxy](#9-nginx-reverse-proxy)
10. [HTTPS with Let's Encrypt](#10-https-with-lets-encrypt)
11. [Frontend Updates](#11-frontend-updates)
12. [OAuth Provider Updates](#12-oauth-provider-updates)
13. [Email/SMTP Migration](#13-emailsmtp-migration)
14. [Auto-Restart on Reboot](#14-auto-restart-on-reboot)
15. [Verification Checklist](#15-verification-checklist)
16. [Troubleshooting](#16-troubleshooting)
17. [Maintenance & Operations](#17-maintenance--operations)

---

## 1. Architecture Overview

### Final Production Topology

```
[Browser/Client]
       │
       │ HTTPS (443)
       ▼
[Hostinger DNS]  api.nextura.my → 20.207.194.66
       │
       ▼
┌─────────────────────────────────────────────────┐
│  VPS — Ubuntu 24.04 LTS (Mumbai, India)         │
│  ┌──────────────────────────────────────────┐  │
│  │ UFW Firewall (22, 80, 443 only)          │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │ Nginx (reverse proxy + SSL termination)  │  │
│  └────────────────┬─────────────────────────┘  │
│                   │ HTTP 127.0.0.1:5000        │
│  ┌────────────────▼─────────────────────────┐  │
│  │ PM2 (auto-restart, persists across boot) │  │
│  └────────────────┬─────────────────────────┘  │
│  ┌────────────────▼─────────────────────────┐  │
│  │ Node.js 20 + Express HRMS API            │  │
│  └────────────────┬─────────────────────────┘  │
└───────────────────┼─────────────────────────────┘
                    │
                    ▼
       [Supabase Singapore]
       ├── PostgreSQL (via Sequelize)
       └── Storage (signed URLs)
```

### Migration Outcomes

| Aspect | Before (Render) | After (VPS) |
|---|---|---|
| **Hosting** | Render (managed PaaS) | Self-managed VPS (Ubuntu 24.04) |
| **Region** | US/EU | Mumbai (closer to Supabase Singapore) |
| **Public URL** | `https://nextura-hrms-api.onrender.com` | `https://api.nextura.my` |
| **SSL** | Render-managed | Let's Encrypt (free, auto-renew) |
| **Process Manager** | Render runtime | PM2 |
| **Cost predictability** | Tier-based, scales with usage | Fixed monthly VPS fee |
| **Cold starts** | Yes on free tier | None |
| **Control** | Limited to dashboard | Full root access |

---

## 2. Prerequisites

Before starting, gather:

### Accounts & Access
- [ ] VPS provider account (any — examples: Hostinger, Contabo, Vultr, Linode, AWS Lightsail, Azure)
- [ ] Domain name registered (this guide uses `nextura.my` from Hostinger)
- [ ] Existing Supabase project (Postgres + Storage) — same DB will be used
- [ ] Render dashboard access (to copy environment variables)
- [ ] Google Cloud Console access (for OAuth callback URL update)
- [ ] GitHub Developer Settings access (for OAuth callback URL update)
- [ ] Netlify access (for frontend redeploy)

### Local Tools
- [ ] VS Code (or Cursor) with **Remote - SSH** extension installed
  - VS Code: extension by `ms-vscode-remote`
  - Cursor: extension by `anysphere`
- [ ] Git CLI
- [ ] Windows PowerShell or any terminal capable of `ssh`

### Credentials/Values to Have Ready
- [ ] All env vars from Render's Environment tab
- [ ] SMTP App Password (e.g., from Google App Passwords)
- [ ] SSH password from VPS provider (initial login only — replaced with key later)

---

## 3. VPS Provisioning

### Specs Used in This Migration

| Spec | Value |
|---|---|
| Plan | VPS-4C56G (4 vCPU, 56GB RAM) |
| OS | Ubuntu 24.04 LTS |
| Region | Mumbai, India |
| Public IP | `20.207.194.66` |
| SSH Port | `22` (open by default) |
| Initial username | `kaelZarn` |

### Critical: Open Required Ports at Provider Firewall

Many VPS providers ship with **only ports 22 (SSH) and 3389 (RDP) open** at the provider's network firewall layer. UFW alone cannot override this — traffic on other ports never reaches the VPS.

**Required ports for HRMS API:**

| Port | Protocol | Purpose |
|---|---|---|
| 22 | TCP | SSH (admin access) |
| 80 | TCP | HTTP (Let's Encrypt verification + redirect to HTTPS) |
| 443 | TCP | HTTPS (production traffic) |

**How to open:** In your VPS provider's control panel, find "Firewall" / "Security Group" / "Network ACL" and add inbound TCP rules for 80 and 443. If your plan doesn't allow this, contact provider support — most resellers will open them on request.

**Verify ports from local machine:**
```powershell
Test-NetConnection 20.207.194.66 -Port 22
Test-NetConnection 20.207.194.66 -Port 80
Test-NetConnection 20.207.194.66 -Port 443
```
All three should return `TcpTestSucceeded : True`.

### Document Your VPS

Save these in your password manager:

```
VPS Plan ID:       VPS-4C56G#X577F
Region:            Mumbai (India)
OS:                Ubuntu 24.04 LTS
Public IP:         20.207.194.66
Hostname:          Orca
Username:          kaelZarn
Password:          <stored in password manager>
SSH Port:          22
Expiry Date:       30 May 2026 23:59 GMT+8
Provider URL:      <provider control panel URL>
```

Set a calendar reminder ~7 days before expiry to renew.

---

## 4. Initial Server Setup

### 4.1. Connect via VS Code Remote-SSH

1. Install **Remote - SSH** extension in VS Code (or Cursor)
2. Press `F1` → `Remote-SSH: Add New SSH Host...`
3. Enter: `ssh kaelZarn@20.207.194.66 -p 22`
4. Save to `C:\Users\<you>\.ssh\config` (or `~/.ssh/config` on macOS/Linux)
5. Optionally rename the host to a friendly name like `hrms-vps` by editing the SSH config:
   ```
   Host hrms-vps
     HostName 20.207.194.66
     User kaelZarn
     Port 22
   ```
6. `F1` → `Remote-SSH: Connect to Host...` → select `hrms-vps`
7. Choose Linux platform when prompted
8. Enter password
9. Open folder: `/home/kaelZarn`

### 4.2. System Update & Basic Tools

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential ca-certificates gnupg lsb-release ufw
```

### 4.3. Set Timezone

```bash
sudo timedatectl set-timezone Asia/Kuala_Lumpur
timedatectl
```

### 4.4. Configure UFW Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Expected output: only ports 22, 80, 443 allowed inbound.

### 4.5. Install fail2ban (Brute-Force Protection)

```bash
sudo apt install fail2ban -y
sudo systemctl enable --now fail2ban
sudo systemctl status fail2ban   # press q to exit pager
```

### 4.6. (Recommended) SSH Key-Based Auth

On your **local Windows machine** (PowerShell):

```powershell
# Generate key (skip if you already have one)
ssh-keygen -t ed25519 -C "kaelZarn-hrms-vps"

# Copy public key to VPS
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh kaelZarn@20.207.194.66 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Then on the VPS, disable password auth:

```bash
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
sudo systemctl restart ssh
```

Verify you can still log in (open a NEW SSH session BEFORE closing the current one — never lock yourself out).

---

## 5. Install Runtime Stack

### 5.1. Node.js 20 LTS (via NodeSource)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x.x
npm -v
```

### 5.2. PM2 (Process Manager)

```bash
sudo npm install -g pm2
pm2 -v
```

### 5.3. Nginx (Reverse Proxy)

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
sudo systemctl status nginx   # press q to exit
```

### 5.4. Certbot (Let's Encrypt SSL)

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 5.5. (Optional) Docker + Docker Compose

If planning to add a Puppeteer/Chromium PDF worker later:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER

# Log out + back in to apply group membership
docker --version
docker compose version
```

---

## 6. Deploy the Application

### 6.1. Folder Structure

```bash
mkdir -p ~/apps/hrms_api
mkdir -p ~/apps/logs
cd ~/apps
ls -la
```

### 6.2. Get the Code

**Option A: Clone from Git (recommended)**

```bash
cd ~/apps
git clone https://github.com/<your-org>/HRMS-API.git hrms_api
cd hrms_api
```

For private repos, use a Personal Access Token or SSH deploy key.

**Option B: VS Code drag & drop**

In VS Code Remote-SSH, navigate to `/home/kaelZarn/apps/hrms_api/` in the file explorer. Drag your local `HRMS-API_v1` folder contents into VS Code (skip `node_modules`).

**Option C: SCP from Windows PowerShell**

```powershell
scp -r "C:\path\to\HRMS-API_v1\*" kaelZarn@20.207.194.66:/home/kaelZarn/apps/hrms_api/
```

### 6.3. Install Dependencies

```bash
cd ~/apps/hrms_api
npm install --production
```

### 6.4. Create `.env`

```bash
nano .env
```

**Minimum required vars:**

```env
NODE_ENV=production
PORT=5000

# --- Database (Supabase Postgres) ---
DATABASE_URL=postgresql://postgres.<projectref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
DB_SSL=true
DB_SYNC=false

# --- Supabase (Storage + Auth) ---
SUPABASE_URL=https://<projectref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
SUPABASE_ANON_KEY=eyJhbGc...

# --- JWT ---
JWT_SECRET=<long random hex>
JWT_REFRESH_SECRET=<different long random hex>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# --- Encryption (used by encryption.js for SMTP password storage) ---
# Falls back to JWT_SECRET if not set. Setting this explicitly prevents
# decryption breakage when JWT_SECRET is rotated.
ENCRYPTION_KEY=<dedicated 32-byte hex>

# --- Frontend (CORS allowlist) ---
FRONTEND_URL=https://nextura-hrms.netlify.app

# --- OAuth (Google) ---
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_CALLBACK_URL=https://api.nextura.my/api/auth/google/callback

# --- OAuth (GitHub) ---
GITHUB_CLIENT_ID=Ov23li...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=https://api.nextura.my/api/auth/github/callback

# --- Email/SMTP (system default) ---
# Per-company SMTP can also be configured via UI (stored encrypted in
# email_configurations table). System defaults are used when no per-company
# config is active.
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=<gmail-address@gmail.com>
EMAIL_PASSWORD=<16-char Google App Password, no spaces>
EMAIL_FROM_NAME=Nextura HRMS
EMAIL_FROM_EMAIL=noreply@nextura.my
```

**Generate strong secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # JWT_REFRESH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY
```

**Lock down permissions:**
```bash
chmod 600 .env
```

### 6.5. `.env` Format Rules

| Value type | Example | Notes |
|---|---|---|
| Simple string | `JWT_SECRET=abc123` | No quotes |
| URL | `DATABASE_URL=postgresql://...` | No quotes |
| Multi-word | `EMAIL_FROM_NAME="Nextura HRMS"` | Quotes only if value contains spaces |
| JSON blob | `FIREBASE_SERVICE_ACCOUNT_PATH=/home/kaelZarn/apps/hrms_api/secrets/firebase.json` | **Don't paste raw JSON** — store as separate file and reference path |
| Hashes/secrets with `#` | `PASSWORD="ab#cd"` | Quote, otherwise `#` parsed as comment |

### 6.6. First Run Test

```bash
node src/app.js
```

Expected: `Server running on port 5000` (or similar). If errors appear, fix `.env` and retry.

`Ctrl+C` to stop. Then move to PM2.

---

## 7. Process Management with PM2

### 7.1. Start the App

```bash
cd ~/apps/hrms_api
pm2 start src/app.js --name hrms-api
pm2 list
```

Expected:
```
┌──┬──────────┬─────────┬──────┬─────┬────────┬───────┬────────┐
│id│name      │version  │mode  │pid  │uptime  │↺      │status  │
├──┼──────────┼─────────┼──────┼─────┼────────┼───────┼────────┤
│0 │hrms-api  │N/A      │fork  │... │1m      │0      │online  │
└──┴──────────┴─────────┴──────┴─────┴────────┴───────┴────────┘
```

### 7.2. Common PM2 Commands

| Command | Purpose |
|---|---|
| `pm2 list` (or `pm2 ls`) | Show all apps |
| `pm2 logs hrms-api` | Live logs (Ctrl+C to exit) |
| `pm2 logs hrms-api --lines 100 --nostream` | Last 100 lines, no live tail |
| `pm2 restart hrms-api` | Restart (after `.env` or code changes) |
| `pm2 reload hrms-api` | Zero-downtime reload (cluster mode) |
| `pm2 stop hrms-api` | Stop without removing |
| `pm2 delete hrms-api` | Remove from PM2 list |
| `pm2 monit` | Live CPU/RAM/log dashboard |
| `pm2 save` | Snapshot current process list to `~/.pm2/dump.pm2` |
| `pm2 flush` | Clear log files |

### 7.3. Avoiding Duplicate Process Bug

If you accidentally run `pm2 start` twice with different invocations (e.g., once `pm2 start npm -- start`, once `pm2 start src/app.js`), PM2 creates **two processes** with the same name. The second one crashes in a restart loop because port 5000 is already taken.

**Fix:**
```bash
pm2 delete <id-of-broken-one>
pm2 save
pm2 list   # confirm only one
```

---

## 8. Domain & DNS Configuration

This guide uses `nextura.my` registered at Hostinger. Adapt for your registrar.

### 8.1. Buy the Domain

At Hostinger checkout:
- ✅ Domain registration only
- ✅ Auto-renewal: ON
- ✅ WHOIS privacy (free if available, otherwise ~RM 30/yr)
- ❌ **DECLINE**: SSL upsell (free via Let's Encrypt)
- ❌ **DECLINE**: Web hosting bundle (using VPS instead)
- ❌ **DECLINE**: Email hosting (use existing email provider)
- ❌ **DECLINE**: SiteLock / Premium DNS / SEO upsells

### 8.2. Add DNS A Record

1. Hostinger → **Domains** → **Manage** next to `nextura.my`
2. Sidebar → **DNS / Nameservers** → **DNS Records** tab
3. **+ Add record**:

| Field | Value |
|---|---|
| Type | `A` |
| Name | `api` (becomes `api.nextura.my`) |
| IPv4 address | `20.207.194.66` |
| TTL | `300` |

4. Save.

### 8.3. (Optional) Add Other Subdomains

```
A       hrms       20.207.194.66                   ← future hrms.nextura.my
CNAME   app        nextura-hrms.netlify.app        ← frontend (when migrated off Netlify URL)
A       @          20.207.194.66                   ← root domain (or leave blank)
CNAME   www        nextura.my                      ← www → root
```

### 8.4. Verify DNS Propagation

From local PowerShell:
```powershell
nslookup api.nextura.my
```
Should return `20.207.194.66`. If not, wait 5–30 minutes and retry.

Or check globally at **dnschecker.org**.

### 8.5. (Optional but Recommended) Move DNS to Cloudflare

Faster propagation, free DDoS protection, better UI:

1. Sign up at **cloudflare.com** (free)
2. Add `nextura.my`, copy the 2 nameservers Cloudflare provides
3. Hostinger → **Domains** → **Manage** → **DNS / Nameservers** → **Change Nameservers** → paste Cloudflare's
4. Wait 5min–24h for activation
5. Re-add the same DNS records inside Cloudflare's DNS panel
6. **Important**: For VPS A record, set Cloudflare proxy to **DNS only (gray cloud)** — otherwise Let's Encrypt HTTP-01 validation breaks

---

## 9. Nginx Reverse Proxy

### 9.1. Create Site Config

```bash
sudo nano /etc/nginx/sites-available/hrms-api
```

Paste:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.nextura.my;

    # Allow Let's Encrypt domain verification
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Proxy everything else to Node.js
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;

        # Timeouts (PDF generation can be slow)
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        # Allow large file uploads
        client_max_body_size 50M;
    }

    access_log /var/log/nginx/hrms-api.access.log;
    error_log /var/log/nginx/hrms-api.error.log;
}
```

### 9.2. Enable the Site

```bash
sudo ln -s /etc/nginx/sites-available/hrms-api /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default      # remove "Welcome to nginx" default
sudo mkdir -p /var/www/certbot
sudo nginx -t                                  # syntax check
sudo systemctl reload nginx
```

Expected `nginx -t` output:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test passed
```

### 9.3. Verify Reverse Proxy Works

From the VPS:
```bash
curl -H "Host: api.nextura.my" http://localhost/api/auth/login
```

Should return JSON from your API (likely a `Method Not Allowed` or `Route not found` since GET isn't handled — that's correct, proves the chain works).

---

## 10. HTTPS with Let's Encrypt

### 10.1. Issue the Certificate

```bash
sudo certbot --nginx -d api.nextura.my
```

Prompts:
1. Email → enter yours (renewal warnings)
2. Agree to TOS → `Y`
3. Share with EFF → `N`
4. Redirect HTTP → HTTPS → choose **`2`** (yes, redirect)

Certbot will:
- Verify domain ownership via port 80 HTTP-01 challenge
- Issue cert (valid 90 days)
- Edit Nginx config to add `listen 443 ssl;` block
- Add `301` redirect from HTTP to HTTPS
- Install systemd timer for auto-renewal

### 10.2. Verify HTTPS Works

```bash
curl -I https://api.nextura.my/
```

Should return `HTTP/2 200` (or whatever your route returns) with no SSL warnings.

In browser: open `https://api.nextura.my/api/auth/login` → see lock icon → click → cert by **Let's Encrypt**.

### 10.3. Verify Auto-Renewal

```bash
sudo certbot renew --dry-run
```

Expected: `Congratulations, all simulated renewals succeeded`.

The systemd timer `certbot.timer` runs twice daily and renews any cert within 30 days of expiry.

---

## 11. Frontend Updates

### 11.1. Update `environment.prod.ts`

[src/environments/environment.prod.ts](../../HRMS_v1/src/environments/environment.prod.ts):

```ts
export const environment = {
  production: true,
  apiUrl: 'https://api.nextura.my/api',
  baseUrl: 'https://api.nextura.my'      // root, NOT including /api
};
```

⚠️ **Critical**: `baseUrl` must NOT include `/api`. The OAuth login code in [auth.service.ts](../../HRMS_v1/src/app/core/services/auth.service.ts) builds URLs as `${baseUrl}/api/auth/google` — if `baseUrl` already ends in `/api`, you get `/api/api/auth/google` (broken).

### 11.2. Update Netlify CSP Header

[netlify.toml](../../HRMS_v1/netlify.toml) `Content-Security-Policy` `connect-src` directive must include the new API domain:

```toml
Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; connect-src 'self' https://api.nextura.my https://nextura-hrms-api.onrender.com https://*.supabase.co; font-src 'self' https://fonts.gstatic.com; object-src 'none'; frame-src 'none';"
```

Without this, the browser blocks all API calls with errors like:
```
Connecting to "<URL>" violates the following Content Security Policy directive: "connect-src 'self' <URL>". The action has been blocked.
```

### 11.3. Commit & Deploy

```bash
git add netlify.toml src/environments/environment.prod.ts
git commit -m "chore: migrate API base URL to api.nextura.my (VPS)"
git push
```

Netlify auto-builds in ~2–3 min. If auto-build doesn't fire:
- **Netlify dashboard** → site → **Deploys** → top-right **Trigger deploy** → **Deploy site**
- Verify the GitHub integration in **Site configuration → Build & deploy → Continuous deployment**

### 11.4. Hard Refresh in Browser

Browsers cache CSP headers aggressively. After deploy:
- Windows: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`

Or DevTools (`F12`) → right-click refresh → **Empty Cache and Hard Reload**.

---

## 12. OAuth Provider Updates

### 12.1. Google OAuth

1. https://console.cloud.google.com/apis/credentials
2. Click your OAuth 2.0 Client ID
3. Under **Authorized redirect URIs** → **+ ADD URI**:
   ```
   https://api.nextura.my/api/auth/google/callback
   ```
4. Keep the old Render URL for now (until VPS is fully stable)
5. **Save**

### 12.2. GitHub OAuth

1. https://github.com/settings/developers → **OAuth Apps** → your app
2. **Authorization callback URL** (only one allowed) → change to:
   ```
   https://api.nextura.my/api/auth/github/callback
   ```
3. **Update application**

If you need both Render and VPS to keep working during transition, create a second GitHub OAuth App with a different `GITHUB_CLIENT_ID`.

### 12.3. Backend `.env` Update

```bash
nano ~/apps/hrms_api/.env
```

Verify:
```env
GOOGLE_CALLBACK_URL=https://api.nextura.my/api/auth/google/callback
GITHUB_CALLBACK_URL=https://api.nextura.my/api/auth/github/callback
FRONTEND_URL=https://nextura-hrms.netlify.app
```

```bash
pm2 restart hrms-api
```

---

## 13. Email/SMTP Migration

### 13.1. How Email Credentials Work

The email service uses a **two-tier credential lookup**:

1. **Per-company SMTP** (preferred) — stored encrypted in `email_configurations` table, configured via UI: **Settings → Email Configuration**
2. **System default** (fallback) — read from `EMAIL_USER` / `EMAIL_PASSWORD` env vars

The encryption key for stored SMTP passwords comes from [src/utils/encryption.js](../../HRMS-API_v1/src/utils/encryption.js):

```js
const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-encryption-key-change-me';
```

### 13.2. Critical Footgun: JWT_SECRET Rotation Breaks Email

If you rotate `JWT_SECRET` without first setting a dedicated `ENCRYPTION_KEY`, all previously-encrypted SMTP passwords become unreadable. Symptom:

```
Missing credentials for "PLAIN"
```

Caused by `decrypt()` returning empty string → fallback transporter has no auth → SMTP rejects.

**Prevention**: Always set `ENCRYPTION_KEY` separately from `JWT_SECRET` in `.env`:
```env
ENCRYPTION_KEY=<dedicated 32-byte hex>
```

**Recovery if already broken**: Re-save SMTP password via the UI (Settings → Email Configuration). This re-encrypts using the current key.

### 13.3. Gmail App Password Setup

Gmail (since 2022) requires an **App Password** for SMTP, not your regular Google password. Symptom:
```
534-5.7.9 Application-specific password required.
```

**Steps:**
1. Enable **2-Step Verification** at https://myaccount.google.com/security (required for App Passwords)
2. Visit https://myaccount.google.com/apppasswords
3. Create app password (name it `Nextura HRMS VPS`)
4. Copy the 16-character password (no spaces — Google strips them either way)
5. Paste into:
   - **Per-company:** Settings → Email Configuration → SMTP Password
   - **System default:** `EMAIL_PASSWORD` in `.env`

### 13.4. Sending Limits to Watch

| Account | Daily limit |
|---|---|
| Personal Gmail | 500/day |
| Google Workspace | 2,000/day |
| SendGrid free | 100/day |
| Amazon SES (from EC2) | 62,000/month free |

For HRMS at scale, plan to migrate to SendGrid or SES once payslip/notification volume grows.

---

## 14. Auto-Restart on Reboot

### 14.1. PM2 systemd Integration

```bash
pm2 startup
```

PM2 prints a `sudo env PATH=...` command. **Copy and run that exact line.** If skipped, the systemd service is never installed.

### 14.2. Save Process Snapshot

Critical step — `pm2 save` must run **while your apps are online**:

```bash
pm2 save
```

This writes `~/.pm2/dump.pm2` — the file `pm2 resurrect` reads at boot.

### 14.3. Known Issue: VS Code Path Pollution

`pm2 startup` captures the current shell's `PATH` into the systemd unit file. If run from a VS Code Remote-SSH terminal, it bakes in VS Code's temporary server path:

```
Environment=PATH=/home/kaelZarn/.vscode-server/cli/servers/Stable-<hash>/server/bin/remote-cli:...
```

After reboot (no VS Code session), that path doesn't exist → service may fail.

### 14.4. Known Issue: `Result: protocol` Failure

PM2 generates a systemd unit with `Type=forking` + `PIDFile=...pm2.pid`. PM2 doesn't reliably create the PID file as systemd expects, causing:
```
Job for pm2-kaelZarn.service failed because the service did not take the steps required by its unit configuration.
Result: protocol
```

### 14.5. Clean Unit File (Recommended Replacement)

```bash
sudo nano /etc/systemd/system/pm2-kaelZarn.service
```

Replace contents with:

```ini
[Unit]
Description=PM2 process manager
Documentation=https://pm2.keymetrics.io/
After=network.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=kaelZarn
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=PM2_HOME=/home/kaelZarn/.pm2

ExecStart=/usr/lib/node_modules/pm2/bin/pm2 resurrect
ExecReload=/usr/lib/node_modules/pm2/bin/pm2 reload all
ExecStop=/usr/lib/node_modules/pm2/bin/pm2 kill

[Install]
WantedBy=multi-user.target
```

Key changes:
- `Type=oneshot` + `RemainAfterExit=yes` instead of `Type=forking`
- Removed `PIDFile=`
- Removed `Restart=on-failure` (oneshot doesn't restart)
- Cleaned `PATH` (no VS Code temp paths)
- Replace `kaelZarn` with your actual username throughout

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl restart pm2-kaelZarn
sudo systemctl status pm2-kaelZarn --no-pager
```

`Active: active (exited)` is the correct state for `Type=oneshot` services.

### 14.6. Reboot Test

```bash
sudo reboot
```

Wait ~30s, reconnect via VS Code SSH. Verify:

```bash
pm2 list                                       # hrms-api should be online
sudo systemctl status pm2-kaelZarn             # active (exited)
curl https://api.nextura.my/api/auth/login     # JSON response
```

---

## 15. Verification Checklist

### Backend Health

- [ ] `pm2 list` shows `hrms-api` online with low restart count
- [ ] `pm2 logs hrms-api --lines 30` shows clean startup, no errors
- [ ] `curl http://localhost:5000/` returns JSON (with `x-forwarded-proto: https` header to avoid HTTPS-redirect 301)

### Network/Proxy

- [ ] `Test-NetConnection 20.207.194.66 -Port 80` from local PowerShell → `True`
- [ ] `Test-NetConnection 20.207.194.66 -Port 443` from local PowerShell → `True`
- [ ] `nslookup api.nextura.my` returns `20.207.194.66`
- [ ] `sudo nginx -t` passes
- [ ] `sudo systemctl status nginx` is `active (running)`

### HTTPS

- [ ] `curl https://api.nextura.my/` returns JSON, no SSL errors
- [ ] Browser shows lock icon at `https://api.nextura.my`
- [ ] Click lock → cert issued by Let's Encrypt
- [ ] `sudo certbot renew --dry-run` reports success

### End-to-End Test

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@nextura.com","password":"<your-password>"}' \
  https://api.nextura.my/api/auth/login
```

Expected: JSON with `token`, `refreshToken`, and `user` object containing `employee`, `company_memberships`, etc. This proves:
- ✅ Public HTTPS reaches Nginx
- ✅ Nginx proxies to Node
- ✅ Express routes correctly
- ✅ Sequelize → Supabase Postgres connection works
- ✅ JWT issuance works
- ✅ DB writes (refresh_token) work

### Frontend

- [ ] `https://nextura-hrms.netlify.app` loads
- [ ] DevTools Network tab shows API calls going to `https://api.nextura.my/api/...`
- [ ] No CSP errors in console
- [ ] Email/password login works
- [ ] OAuth login (Google + GitHub) works
- [ ] Payslip email send works (after configuring SMTP)

### Reboot Resilience

```bash
sudo reboot
# Wait 30-60 sec, reconnect
pm2 list                                       # online
curl https://api.nextura.my/api/auth/login     # JSON response
```

---

## 16. Troubleshooting

### "Welcome to nginx!" page is blocked / browser can't reach VPS

**Cause:** Provider firewall blocking port 80/443 (UFW alone is not enough).

**Fix:** Open ports 80 and 443 in your VPS provider's control panel firewall settings, or contact provider support.

---

### `301 Moved Permanently` when curling localhost:5000

**Cause:** App's HTTPS-redirect middleware redirects all non-HTTPS requests.

**Fix (for local testing only):**
```bash
curl -H "x-forwarded-proto: https" http://localhost:5000/api/auth/login
```

In production, Nginx adds the `X-Forwarded-Proto: https` header automatically when proxying.

---

### `connect ECONNREFUSED 127.0.0.1:5432`

**Cause:** App is trying to connect to local Postgres because env vars (`DATABASE_URL`) aren't being read.

**Fix:**
1. `cat ~/apps/hrms_api/.env` — confirm file exists, has correct values
2. Confirm `.env` lives in the same folder as `package.json`
3. `chmod 600 .env`
4. Check for BOM: `file .env` should say `ASCII text`. If `UTF-8 with BOM`:
   ```bash
   sed -i '1s/^\xEF\xBB\xBF//' .env
   ```
5. Verify with:
   ```bash
   node -e "require('dotenv').config(); console.log('DB:', process.env.DATABASE_URL ? 'set' : 'MISSING')"
   ```
6. `pm2 restart hrms-api`

---

### CSP error: "violates Content Security Policy directive"

**Cause:** New API domain not whitelisted in `connect-src` directive.

**Fix:** Update [netlify.toml](../../HRMS_v1/netlify.toml) CSP `connect-src` to include `https://api.nextura.my`. Commit + push. Hard-refresh browser.

---

### `/api/api/auth/google` (double `/api`)

**Cause:** `baseUrl` in `environment.prod.ts` includes `/api`; the OAuth code appends `/api` again.

**Fix:** Set `baseUrl: 'https://api.nextura.my'` (no trailing path).

---

### Email error: `Missing credentials for "PLAIN"`

**Cause:** `decrypt()` returned empty string. Either:
1. Per-company `email_configurations` row exists but encrypted with old `JWT_SECRET`/`ENCRYPTION_KEY` (key was rotated)
2. No per-company config AND `EMAIL_USER`/`EMAIL_PASSWORD` env vars are missing

**Fix:**
- Re-save SMTP password via UI (Settings → Email Configuration) — re-encrypts with current key
- OR set `ENCRYPTION_KEY` to the previous JWT_SECRET value
- OR populate `EMAIL_USER` + `EMAIL_PASSWORD` in `.env` for system default

---

### Email error: `534-5.7.9 Application-specific password required`

**Cause:** Using regular Gmail password instead of App Password.

**Fix:** Generate App Password at https://myaccount.google.com/apppasswords (requires 2FA enabled) → paste 16-char password.

---

### `Result: protocol` when restarting `pm2-kaelZarn` service

**Cause:** PM2's generated systemd unit uses `Type=forking` + `PIDFile=` which doesn't work reliably.

**Fix:** Replace unit file with `Type=oneshot` version (see [Section 14.5](#145-clean-unit-file-recommended-replacement)).

---

### After reboot, `pm2 list` is empty

**Cause:** Either:
1. `pm2 startup`'s printed `sudo` command was never run (systemd service not installed)
2. `pm2 save` was run when no apps were online (empty `dump.pm2`)
3. Systemd unit fails (see `Result: protocol` issue above)

**Fix sequence:**
```bash
# 1. Make sure app is running
pm2 start src/app.js --name hrms-api

# 2. Generate startup command + RUN the printed sudo line
pm2 startup
# Copy and run: sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u kaelZarn --hp /home/kaelZarn

# 3. Save while app is online
pm2 save

# 4. Verify
sudo systemctl is-enabled pm2-kaelZarn   # enabled
sudo systemctl is-active pm2-kaelZarn    # active (exited)
```

---

### Two `hrms-api` processes in PM2 list, one keeps restarting

**Cause:** Started twice with different invocations (e.g., `pm2 start npm -- start` AND `pm2 start src/app.js`).

**Fix:**
```bash
pm2 delete <broken-id>    # check restart count to identify which
pm2 save
pm2 list   # confirm only one
```

---

### Netlify auto-build doesn't fire after `git push`

**Possible causes (ranked):**
1. Pushed to wrong branch (Netlify watches `main`, you pushed `master`, etc.)
2. Auto-publishing toggled OFF in Netlify dashboard
3. GitHub integration lost permission
4. Webhook delivery failed

**Fix:** Manually trigger via Netlify dashboard → site → **Deploys** → **Trigger deploy → Deploy site**. Then diagnose:
- `git branch --show-current` vs Netlify's "Production branch" setting
- Netlify Deploys tab → look for "Resume auto publishing"
- GitHub repo → Settings → Webhooks → check Recent Deliveries for the Netlify hook

---

## 17. Maintenance & Operations

### Routine Tasks

| Frequency | Task | Command |
|---|---|---|
| Weekly | OS security updates | `sudo apt update && sudo apt upgrade -y` |
| Monthly | Restart VPS to apply kernel updates | `sudo reboot` |
| Quarterly | Review PM2 logs for warnings | `pm2 logs hrms-api --lines 500 --nostream` |
| Quarterly | Verify SSL renewal still working | `sudo certbot renew --dry-run` |
| Quarterly | Review UFW + fail2ban logs | `sudo journalctl -u fail2ban -n 100` |
| Annually | Renew domain (auto-renewal should handle, verify) | (registrar dashboard) |
| Annually | Renew VPS plan | (provider dashboard) |
| As needed | Rotate `JWT_SECRET` + `JWT_REFRESH_SECRET` | (also re-save SMTP via UI if `ENCRYPTION_KEY` not set) |

### Watching Live Logs

```bash
# Application
pm2 logs hrms-api

# Nginx access (per-site)
sudo tail -f /var/log/nginx/hrms-api.access.log

# Nginx errors
sudo tail -f /var/log/nginx/hrms-api.error.log

# System (any service)
sudo journalctl -u nginx -f
sudo journalctl -u pm2-kaelZarn -f
```

### Deploying Code Changes

```bash
cd ~/apps/hrms_api
git pull
npm install --production    # if package.json changed
pm2 restart hrms-api
pm2 logs hrms-api --lines 30
```

For `.env` changes:
```bash
nano .env
pm2 restart hrms-api    # picks up new env values
```

### Health Monitoring (Recommended)

Free options:
- **UptimeRobot** (uptimerobot.com) — pings `https://api.nextura.my/` every 5 min, emails/SMS on downtime
- **Cloudflare Notifications** — if using Cloudflare DNS
- **Better Stack** — log aggregation + uptime monitoring

For `/api/health` endpoint, add to [src/app.js](../src/app.js) before route registrations:
```js
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV,
  });
});
```

### Backup Strategy

| Layer | Backup |
|---|---|
| **Database** | Supabase automatic daily backups (built-in, retained 7 days on free tier) |
| **File storage** | Supabase Storage versioning (manual) — consider S3 cross-region replication for critical files |
| **`.env` secrets** | Stored in password manager (1Password / Bitwarden) — NEVER commit to git |
| **VPS configs** (`/etc/nginx`, `/etc/systemd`) | Periodic `tar czf nginx-backup.tar.gz /etc/nginx` to local machine |
| **PM2 state** | `~/.pm2/dump.pm2` is regenerated by `pm2 save` — no separate backup needed |

### Emergency Rollback to Render

If the VPS goes down and you need to fail back to Render quickly:

1. **Hostinger DNS** → Edit `api` A record → change IP to a CNAME pointing at the old Render URL — OR — update `environment.prod.ts` to use `https://nextura-hrms-api.onrender.com` and redeploy frontend
2. Update OAuth callback URLs at Google + GitHub back to Render's
3. Render service should still be running (don't delete it for at least the first month)

### Decommissioning Render

After ~1 month of stable VPS operation:
1. Pause the Render service (don't delete yet — just pause, keeps env vars)
2. After another month, delete it
3. Remove the old Render URL from Netlify CSP `connect-src`
4. Remove old OAuth callback URLs from Google + GitHub consoles

---

## Appendix A: Useful One-Liners

```bash
# Show what's listening on port 5000
sudo ss -tlnp | grep :5000

# Show all open ports
sudo ss -tlnp

# Test API end-to-end (with login)
curl -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@nextura.com","password":"<pw>"}' \
  https://api.nextura.my/api/auth/login

# Inspect SSL cert
echo | openssl s_client -showcerts -servername api.nextura.my -connect api.nextura.my:443 2>/dev/null | openssl x509 -inform pem -noout -text | grep -E "Issuer:|Not After:|DNS:"

# View encrypted SMTP config rows (without passwords)
cd ~/apps/hrms_api
node -e "require('dotenv').config(); const {EmailConfiguration}=require('./src/models'); EmailConfiguration.findAll({attributes:['id','company_id','smtp_host','smtp_user','from_email','is_active']}).then(r=>{console.log(JSON.stringify(r,null,2));process.exit(0)})"

# Check Disk usage
df -h

# Check RAM/CPU
free -h
top   # press q to exit

# View systemd service file
systemctl cat pm2-kaelZarn

# Reload nginx without dropping connections
sudo systemctl reload nginx

# Hard restart nginx (drops connections briefly)
sudo systemctl restart nginx
```

---

## Appendix B: File Locations Reference

| Path | Purpose |
|---|---|
| `~/apps/hrms_api/` | Application code |
| `~/apps/hrms_api/.env` | Environment variables (chmod 600) |
| `~/apps/hrms_api/src/app.js` | Express app entry point |
| `~/.pm2/dump.pm2` | PM2 process snapshot |
| `~/.pm2/logs/` | PM2 log files |
| `/etc/nginx/sites-available/hrms-api` | Nginx site config (source) |
| `/etc/nginx/sites-enabled/hrms-api` | Symlink that activates the config |
| `/etc/letsencrypt/live/api.nextura.my/` | SSL cert + private key |
| `/etc/systemd/system/pm2-kaelZarn.service` | PM2 auto-start unit |
| `/var/log/nginx/hrms-api.access.log` | Per-site access log |
| `/var/log/nginx/hrms-api.error.log` | Per-site error log |
| `/var/www/certbot/` | Let's Encrypt HTTP-01 challenge dir |

---

## Appendix C: Migration History

| Date | Change |
|---|---|
| 2026-05-01 | VPS provisioned (Hostinger via Azure, Mumbai) |
| 2026-05-01 | Initial setup: Node 20, PM2, Nginx, Certbot, UFW, fail2ban |
| 2026-05-01 | Code deployed to `~/apps/hrms_api/` |
| 2026-05-04 | Domain `nextura.my` registered at Hostinger |
| 2026-05-04 | DNS A record `api → 20.207.194.66` configured |
| 2026-05-04 | Nginx reverse proxy + Let's Encrypt HTTPS configured |
| 2026-05-04 | Frontend `environment.prod.ts` updated to new API URL |
| 2026-05-04 | Netlify CSP updated to allow `https://api.nextura.my` |
| 2026-05-04 | OAuth callback URLs updated at Google + GitHub |
| 2026-05-04 | PM2 systemd unit hardened (Type=oneshot, clean PATH) |
| 2026-05-04 | Email/SMTP re-configured (App Password + ENCRYPTION_KEY) |
| 2026-05-29 | Re-migration: Azure/Hostinger Mumbai → Contabo Singapore (parallel-run cutover) — see Appendix D |

---

## Appendix D: Azure → Contabo Re-Migration (Parallel-Run Cutover)

Second migration. Moves the HRMS API off the expiring Hostinger/Azure VPS (Mumbai,
`20.207.194.66`, expires 30 May 2026) onto a new Contabo VPS (Singapore). Reuses
Sections 4–14 of this guide for the bulk of the work; this appendix only documents
the **deltas**: the parallel-run cutover strategy and the new LibreOffice dependency.

### D.0. Why Parallel-Run

Both VPSs are available simultaneously until 30 May. We stand up the new VPS fully on a
**temporary subdomain** (`api-new.nextura.my`), validate it under real HTTPS, then swap the
`api.nextura.my` DNS A record. Downtime = DNS propagation only (< 5 min). Rollback = revert
the A record.

### D.1. Topology Change

| Aspect | Before (this migration) | After |
|---|---|---|
| Provider | Hostinger/Azure | Contabo |
| Region | Mumbai, India | Singapore |
| Public IP | `20.207.194.66` | `<CONTABO_IP>` |
| PDF: pdfkit | pure JS (no dep) | unchanged |
| PDF: libreoffice-convert | **not installed on host** | LibreOffice installed (new) |
| Domain | `api.nextura.my` | unchanged (DNS A record re-pointed) |
| OAuth callbacks | `api.nextura.my/...` | unchanged (no provider edits needed) |
| Supabase (DB + Storage) | external | unchanged |

Because the domain and all callback URLs are preserved, **no OAuth provider, Netlify CSP, or
`environment.prod.ts` changes are required** — unlike the Render→Azure migration.

### D.2. New Dependency: LibreOffice (for `libreoffice-convert`)

The API uses `libreoffice-convert` ^1.8.1 (DOCX/XLSX → PDF) which spawns the `soffice` binary.
This was missing from the original host setup. Add it during Section 5 (Runtime Stack):

```bash
sudo apt install -y libreoffice --no-install-recommends
sudo apt install -y fonts-liberation fonts-noto-cjk fonts-noto-color-emoji
soffice --version   # confirm install
```

`pdfkit` is pure JavaScript and needs nothing extra.

### D.3. Cutover Sequence

| Phase | Action | Ref |
|---|---|---|
| 1 | Harden new VPS (SSH keys, UFW, fail2ban, timezone) | §4 |
| 2 | Install Node 20, PM2, Nginx, Certbot, **+ LibreOffice** | §5 + D.2 |
| 3 | Clone code, `npm install --production`, transfer `.env` from old VPS | §6 |
| 4 | Add temp DNS `api-new.nextura.my` → new IP; Nginx + Certbot for temp subdomain; `pm2 start` | §8–10 |
| 5 | Smoke test on `https://api-new.nextura.my` (login, PDF×2, email, upload) | §15 |
| 6 | Lower `api` TTL to 60; flip A record to new IP; `certbot --nginx -d api.nextura.my`; verify | §8, §10 |
| 7 | Monitor 24–48h; delete temp subdomain + cert; let old VPS expire; re-raise TTL | §17 |

### D.4. Transfer `.env` Securely (old → local → new)

Go through your local machine over SSH; never expose secrets to a third party.

```powershell
# LOCAL PowerShell
scp kaelZarn@20.207.194.66:/home/kaelZarn/apps/hrms_api/.env C:\temp\hrms.env
scp C:\temp\hrms.env kaelZarn@<CONTABO_IP>:/home/kaelZarn/apps/hrms_api/.env
Remove-Item C:\temp\hrms.env   # securely delete local copy
```

```bash
# NEW VPS
chmod 600 ~/apps/hrms_api/.env
file ~/apps/hrms_api/.env                 # must say "ASCII text"
sed -i '1s/^\xEF\xBB\xBF//' ~/apps/hrms_api/.env   # strip BOM if present
```

Confirm `ENCRYPTION_KEY` is present (see §13.2 — its absence breaks stored SMTP passwords).

### D.5. Temp-Subdomain Nginx Block

Identical to §9.1 with `server_name api-new.nextura.my;`. After cutover, copy to a
real-domain config and re-point:

```bash
sudo cp /etc/nginx/sites-available/hrms-api-new /etc/nginx/sites-available/hrms-api
sudo sed -i 's/api-new.nextura.my/api.nextura.my/g' /etc/nginx/sites-available/hrms-api
sudo ln -s /etc/nginx/sites-available/hrms-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.nextura.my    # choose redirect HTTP→HTTPS
```

### D.6. Smoke-Test Matrix (Phase 5)

| Test | Pass criteria |
|---|---|
| `curl https://api-new.nextura.my/` | JSON, no SSL error |
| POST `/api/auth/login` | returns JWT + refreshToken |
| Payslip download (pdfkit) | valid PDF |
| Memo/policy export (libreoffice-convert) | valid PDF, CJK/fonts render |
| Forgot-password email | email arrives |
| Document upload | lands in Supabase Storage |
| `pm2 logs hrms-api` | no unhandled errors |

OAuth and frontend integration are deferred to post-cutover (callbacks point at the real
domain, not the temp subdomain).

### D.7. Contabo-Specific Gotchas

- **Provider firewall:** Contabo Customer Control Panel → Network → Firewall. Confirm inbound
  22/80/443 are allowed (same trap as §3 — UFW alone is insufficient).
- **Provisioning delay:** Contabo can take 24–48h post-purchase before the VPS is usable.
- **Disk I/O:** Contabo's storage is slower than Vultr/DO. LibreOffice cold-start (first
  `soffice` spawn) may take a few seconds; subsequent conversions are cached and fast.

### D.8. Rollback

DNS swap is reversible in minutes — revert the `api` A record to `20.207.194.66` (TTL 60).
The old VPS keeps running PM2 + Nginx + cert until expiry (30 May), so it remains a hot
fallback for the full overlap window. Do not delete the old VPS for at least 7 days.
