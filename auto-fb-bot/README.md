# 🤖 ByteBangla - Automated Facebook Content Bot

> **সহজ বাংলায় এআই ও টেকনোলজি টিপস**  
> A production-ready, TypeScript-powered automated Facebook content generation and publishing engine using **Google Gemini 1.5 Flash** and the **Meta Graph API (v21.0)**.

---

## 🌟 Key Features

- **Automated High-Quality Bengali Content**: Powered by Google Gemini 1.5 Flash with custom prompt engineering tailored for **ByteBangla**.
- **Structured 4-Step Viral Format**: Every post follows a proven engagement structure:
  1. 🎯 Catchy Hook (আকর্ষণীয় শিরোনাম যা স্ক্রোল থামাবে)
  2. 💡 3 Practical Tips / Steps (বাস্তবসম্মত ৩টি ধাপ বা টুলসের ব্যবহার)
  3. 📢 Call to Action (সেভ, শেয়ার ও কমেন্ট করার আহ্বান)
  4. 🏷️ Curated Tech Hashtags (`#ByteBangla #AITools #TechBangla #Productivity`)
- **Direct Meta Graph API Integration**: Publishes directly to your Facebook Page feed using Graph API v21.0 with detailed error reporting and ID tracking.
- **Automated Cron Scheduler**: Scheduled via `node-cron` (default: **09:30 AM Asia/Dhaka daily**).
- **Facebook Webhooks Ready**: Fully implements Meta's challenge handshake verification (`GET /webhook`) and incoming event reception (`POST /webhook`).
- **Instant Test Endpoint**: Trigger manual posts on-demand via `POST /test-post` with optional custom topic overrides.
- **Production-Ready Architecture**: Strict TypeScript, runtime environment validation, comprehensive logging, and graceful shutdown handlers.

---

## 📂 Project Directory Structure

```text
auto-fb-bot/
├── src/
│   ├── config/
│   │   └── env.ts           # Strongly-typed environment variables & validation
│   ├── routes/
│   │   ├── health.ts        # GET /health - Service monitoring & uptime
│   │   └── webhook.ts       # GET/POST /webhook - Facebook Webhook handshake & event listener
│   ├── services/
│   │   ├── ai.ts            # Gemini 1.5 Flash content generation service
│   │   └── facebook.ts      # Meta Graph API v21.0 publishing service
│   ├── jobs/
│   │   └── publisher.ts     # Curated topic rotation, manual trigger & cron scheduler
│   └── server.ts            # Express server initialization & lifecycle
├── .env.example             # Template for required environment variables
├── .gitignore               # Git ignore rules for node_modules, dist, and secrets
├── package.json             # Scripts & dependency definitions
├── tsconfig.json            # ES2022 TypeScript configuration
└── README.md                # Comprehensive documentation
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: `v18.0.0` or higher (tested on Node v20/v24)
- **npm**: `v9.0.0` or higher
- **Google Gemini API Key** (from Google AI Studio)
- **Facebook Page & Meta Developer App** with Page Access Token

### 2. Installation
Open your terminal in the `auto-fb-bot` directory and install dependencies:

```bash
cd auto-fb-bot
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to create your local `.env`:

```bash
cp .env.example .env
```

Open `.env` in your text editor and fill in your credentials:

```env
PORT=3000
NODE_ENV=development

# Facebook Meta Graph API Credentials
PAGE_ID=your_actual_page_id
PAGE_ACCESS_TOKEN=your_page_access_token
VERIFY_TOKEN=your_custom_webhook_secret_token

# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key

# Posting Schedule (Default: Every day at 09:30 AM BST)
CRON_SCHEDULE="30 9 * * *"
```

---

## 🔑 How to Obtain API Keys & Credentials

### A. Google Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Sign in with your Google account.
3. Click **"Create API Key"** (in a new or existing Google Cloud project).
4. Copy the generated key and paste it as `GEMINI_API_KEY` in `.env`.

---

### B. Facebook Page ID & Page Access Token

#### 1. Find Your Page ID:
- Navigate to your Facebook Page (e.g. `facebook.com/YourPage`).
- Click **About** > **Page Transparency** (or look at your Page URL or Settings).
- Copy your numeric **Page ID** and set it as `PAGE_ID` in `.env`.

#### 2. Generate a Long-Lived Page Access Token:
1. Visit the [Meta for Developers Portal](https://developers.facebook.com/) and register/log in.
2. Click **My Apps** > **Create App** > Select **"Other"** > Choose **"Business"** type.
3. Open the **[Graph API Explorer](https://developers.facebook.com/tools/explorer/)**.
4. In the top right:
   - Select your **Meta App**.
   - Under **User or Page**, select your **Facebook Page**.
5. Add the following permissions:
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `pages_show_list`
6. Click **Generate Access Token** and approve the Facebook permissions dialog.
7. To convert this into a permanent/long-lived Page token:
   - Open the **Access Token Tool**: [Meta Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/).
   - Paste your token and click **Debug** > **Extend Access Token**.
8. Copy the extended token and set it as `PAGE_ACCESS_TOKEN` in `.env`.

---

### C. Webhook Configuration (Optional for Receiving Events)

1. When deploying locally for testing, expose your server with a tunnel tool such as **ngrok** or **Cloudflare Tunnel**:
   ```bash
   npx ngrok http 3000
   ```
2. In your Meta Developer App dashboard, navigate to **Webhooks** > Select **Page**.
3. In **Callback URL**, enter: `https://your-tunnel-url.ngrok-free.app/webhook`
4. In **Verify Token**, enter the exact string you configured in `.env` for `VERIFY_TOKEN`.
5. Click **Verify and Save**. Meta will perform a `GET` handshake to your server.
6. Subscribe to page fields such as `feed` or `messages`.

---

## 🏃 Running the Application

### Development Mode (with Live Reload)
```bash
npm run dev
```

### Production Build & Run
```bash
# 1. Compile TypeScript to JavaScript in /dist
npm run build

# 2. Run compiled production server
npm run start
```

---

## 🧪 Testing Endpoints

### 1. Health Check
Check if the bot server and external configurations are ready:
```bash
curl http://localhost:3000/health
```
**Sample Response:**
```json
{
  "status": "OK",
  "brand": "ByteBangla Content Bot",
  "uptime": 12.45,
  "timestamp": "2026-09-29T14:40:00.000Z",
  "environment": "development",
  "services": {
    "geminiConfigured": true,
    "facebookConfigured": true,
    "cronSchedule": "30 9 * * *"
  }
}
```

---

### 2. Trigger Instant Facebook Post (`POST /test-post`)

You can test content generation and Facebook publishing immediately without waiting for the scheduled cron job.

#### Option A: Post with Automatic Curated Topic
```bash
curl -X POST http://localhost:3000/test-post
```

#### Option B: Post with Custom Topic Override
```bash
curl -X POST http://localhost:3000/test-post \
  -H "Content-Type: application/json" \
  -d '{"topic": "ছাত্র-ছাত্রীদের পড়াশোনায় সময় বাঁচানোর সেরা ৩টি ফ্রি AI টুল"}'
```

**Sample Success Response:**
```json
{
  "success": true,
  "message": "Content generated and published to Facebook successfully!",
  "data": {
    "success": true,
    "topic": "ছাত্র-ছাত্রীদের পড়াশোনায় সময় বাঁচানোর সেরা ৩টি ফ্রি AI টুল",
    "content": "পড়াশোনা ও অ্যাসাইনমেন্ট তৈরিতে ঘণ্টার পর ঘণ্টা সময় নষ্ট হচ্ছে? 📚🤖\n\nAI এখন আপনার ব্যক্তিগত স্টাডি অ্যাসিস্ট্যান্ট হতে পারে! চলুন দেখে নেওয়া যাক সহজে ব্যবহারযোগ্য ৩টি অসাধারণ টুল:\n\n১. Notion AI: আপনার ক্লাসের নোট সাজাতে এবং বড় চ্যাপ্টারের মূল পয়েন্ট এক ক্লিকে সামারি করতে দারুণ কার্যকর।\n২. Perplexity AI: প্রথাগত গুগলের চেয়ে দ্রুত রেফারেন্স এবং গবেষণামূলক তথ্যের সঠিক উত্তর খুঁজে দেয়।\n৩. Gamma App: যে কোনো প্রজেক্ট বা প্রেজেন্টেশন স্লাইড মাত্র কয়েক মিনিটে তৈরি করার সেরা মাধ্যম।\n\n💡 কোন টুলটি আপনি সবচেয়ে বেশি ব্যবহার করেন? কমেন্টে জানান এবং পোস্টটি বন্ধুদের সাথে শেয়ার করুন!\n\n#ByteBangla #AITools #TechBangla #Productivity #BanglaTech",
    "postId": "102938475620192_987654321012345",
    "timestamp": "2026-09-29T14:41:00.000Z"
  }
}
```

---

### 3. Test Webhook Verification Handshake
Simulate Meta's verification handshake request:
```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.challenge=99887766&hub.verify_token=bytebangla_secure_verify_token_2026"
```
**Expected Response:** `99887766` with HTTP Status `200`.

---

## ⏰ Customizing the Schedule

The posting cron job schedule can be changed via the `CRON_SCHEDULE` environment variable in `.env`.

Format: `minute hour day month day-of-week` (Asia/Dhaka timezone)

| Schedule | Cron Expression |
| :--- | :--- |
| Every day at 09:30 AM (Default) | `30 9 * * *` |
| Every day at 08:00 PM | `0 20 * * *` |
| Twice daily (10:00 AM & 09:00 PM) | `0 10,21 * * *` |
| Every 6 hours | `0 */6 * * *` |

---

## 🛡️ License

This project is licensed under the MIT License - feel free to use and customize it for your brand automation.
