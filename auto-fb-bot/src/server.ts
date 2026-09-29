import express, { Request, Response, NextFunction } from 'express';
import { env, validateEnv } from './config/env';
import healthRouter from './routes/health';
import webhookRouter from './routes/webhook';
import { initPublisherJob, triggerManualPost } from './jobs/publisher';
import { getRecentPosts, getRecentComments, isDatabaseConnected } from './services/db';

const app = express();

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.originalUrl.startsWith('/health')) {
      console.log(`[HTTP] ${req.method} ${req.originalUrl} - ${_res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Mount Routes
app.use('/health', healthRouter);
app.use('/webhook', webhookRouter);

/**
 * Root Dashboard: Modern Control Panel with Tailwind CSS
 * Route: GET /
 */
app.get('/', async (_req: Request, res: Response) => {
  const recentPosts = await getRecentPosts(6);
  const recentComments = await getRecentComments(5);
  const dbConnected = isDatabaseConnected();

  const postsHtml = recentPosts.length === 0
    ? `<div class="p-8 text-center text-slate-400 bg-slate-800/40 rounded-xl border border-slate-700/50">
        <p class="text-sm">এখনও কোনো পোস্ট রেকর্ড করা হয়নি। নিচের বাটনে ক্লিক করে প্রথম ড্রাফট সিমুলেট করুন!</p>
       </div>`
    : recentPosts
        .map((p) => {
          const fbLink = `https://www.facebook.com/${env.PAGE_ID}/posts/${p.facebookPostId.includes('_') ? p.facebookPostId.split('_')[1] : p.facebookPostId}`;
          const dateStr = new Date(p.publishedAt).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
          const imgTag = p.imageUrl
            ? `<img src="${p.imageUrl}" alt="Banner" class="w-full h-36 object-cover rounded-lg mb-3 border border-slate-700/60" />`
            : '';

          return `
          <div class="bg-slate-800/70 border border-slate-700/70 rounded-xl p-4 flex flex-col justify-between hover:border-cyan-500/50 transition duration-200">
            <div>
              ${imgTag}
              <div class="flex items-center justify-between text-xs text-cyan-400 font-mono mb-2">
                <span>ID: ${p.facebookPostId.substring(0, 18)}...</span>
                <span class="text-slate-400">${dateStr}</span>
              </div>
              <p class="text-slate-200 text-sm line-clamp-3 mb-3 leading-relaxed">${p.caption}</p>
            </div>
            <a href="${fbLink}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-medium rounded-lg border border-cyan-500/30 transition">
              <span>ফেসবুকে দেখুন</span>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
            </a>
          </div>`;
        })
        .join('');

  const commentsHtml = recentComments.length === 0
    ? `<div class="p-6 text-center text-slate-400 bg-slate-800/40 rounded-xl border border-slate-700/50 text-sm">
        কোনো নতুন কমেন্ট পাওয়া যায়নি।
       </div>`
    : recentComments
        .map(({ comment, replies }) => {
          const replyBadge = replies.length > 0
            ? `<span class="inline-block px-2 py-0.5 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">AI Replied</span>`
            : `<span class="inline-block px-2 py-0.5 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">Logged</span>`;

          const replyText = replies.length > 0
            ? `<div class="mt-2 pl-3 border-l-2 border-emerald-500/50 text-xs text-slate-300">
                <span class="text-emerald-400 font-semibold">বাইট বাংলা:</span> ${replies[0].replyText}
               </div>`
            : '';

          return `
          <div class="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 mb-2.5">
            <div class="flex items-center justify-between text-xs mb-1.5">
              <span class="font-semibold text-slate-200">${comment.senderName || 'ব্যবহারকারী'}</span>
              ${replyBadge}
            </div>
            <p class="text-xs text-slate-300 mb-1">"${comment.text}"</p>
            <div class="flex items-center gap-2 text-[10px] text-slate-400">
              <span class="px-1.5 py-0.5 bg-slate-700/50 rounded">Tag: ${comment.classification}</span>
            </div>
            ${replyText}
          </div>`;
        })
        .join('');

  const html = `
  <!DOCTYPE html>
  <html lang="bn" class="dark">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ByteBangla - Autonomous AI Facebook Engine</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Hind Siliguri', sans-serif; }
    </style>
  </head>
  <body class="bg-slate-950 text-slate-100 min-h-screen">
    <!-- Navbar -->
    <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-cyan-500/20">
            B
          </div>
          <div>
            <h1 class="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              ByteBangla AI Engine
            </h1>
            <p class="text-[11px] text-slate-400 -mt-1">সহজ বাংলায় এআই ও টেকনোলজি টিপস</p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 px-3 py-1 bg-slate-800/80 rounded-full border border-slate-700 text-xs">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span class="text-slate-300">Bot Active</span>
          </div>
          <a href="https://www.facebook.com/${env.PAGE_ID}" target="_blank" class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 shadow">
            <span>ফেসবুক পেজ</span>
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </a>
        </div>
      </div>
    </header>

    <!-- Main Container -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      <!-- Top Metrics Strip -->
      <section class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p class="text-xs text-slate-400">Page ID</p>
          <p class="text-base font-bold text-cyan-400 font-mono mt-1">${env.PAGE_ID}</p>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p class="text-xs text-slate-400">AI Intelligence</p>
          <p class="text-base font-bold text-purple-400 mt-1">Self-Learning Agent</p>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p class="text-xs text-slate-400">Posting Cron</p>
          <p class="text-base font-bold text-amber-400 font-mono mt-1">${env.CRON_SCHEDULE}</p>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p class="text-xs text-slate-400">Database Engine</p>
          <p class="text-base font-bold ${dbConnected ? 'text-emerald-400' : 'text-blue-400'} mt-1">
            ${dbConnected ? 'PostgreSQL' : 'Resilient Local'}
          </p>
        </div>
      </section>

      <!-- Action Trigger Card -->
      <section class="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-850 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div class="max-w-xl">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-3">
              Autonomous Pipeline Hub
            </span>
            <h2 class="text-xl sm:text-2xl font-bold text-white">এআই কনটেন্ট ড্রাফট ও টেস্ট করুন</h2>
            <p class="text-sm text-slate-400 mt-1.5">
              এআই স্বয়ংক্রিয়ভাবে ট্রেন্ডিং টেক টপিক রিসার্চ করবে, ৩-স্টেপ হুকসহ বাংলা কনটেন্ট লিখবে, থ্রি-ডি ব্যানার বানাবে এবং ক্রিটিক অডিট চালাবে।
            </p>
            <div class="mt-4">
              <input id="customTopicInput" type="text" placeholder="কাস্টম টপিক লিখুন (ফাঁকা রাখলে এআই নিজে সিলেক্ট করবে)" class="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500" />
            </div>
          </div>
          <div class="flex flex-col sm:flex-row gap-3">
            <!-- Safe Preview / Dry Run Button (Doesn't Post to FB) -->
            <button id="previewBtn" onclick="runPipeline(true)" class="px-5 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm rounded-xl shadow-lg transition duration-200 flex items-center justify-center gap-2 cursor-pointer">
              <span id="previewSpinner" class="hidden animate-spin">🌀</span>
              <span id="previewText">🧪 Simulate & Preview (পোস্ট ছাড়া)</span>
            </button>

            <!-- Direct Live Publish Button -->
            <button id="liveBtn" onclick="runPipeline(false)" class="px-5 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-cyan-500/25 transition duration-200 flex items-center justify-center gap-2 cursor-pointer">
              <span id="liveSpinner" class="hidden animate-spin">🌀</span>
              <span id="liveText">🚀 Post Live to Facebook</span>
            </button>
          </div>
        </div>

        <!-- Live Feedback Banner -->
        <div id="liveFeedback" class="hidden mt-6 pt-5 border-t border-slate-800 text-sm">
          <div class="flex items-center gap-2 text-cyan-400 font-medium">
            <span class="animate-pulse">●</span>
            <span id="feedbackText">পাইপলাইন চলছে...</span>
          </div>
        </div>

        <!-- Live Preview Modal / Container -->
        <div id="previewCard" class="hidden mt-6 pt-5 border-t border-slate-800 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold">
                🛡️ Safe Preview Mode (ফেসবুকে পোস্ট হয়নি)
              </span>
              <span id="criticScoreBadge" class="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold">
                Critic Score: 95/100
              </span>
            </div>
            <button onclick="document.getElementById('previewCard').classList.add('hidden')" class="text-xs text-slate-400 hover:text-white">✕ Close Preview</button>
          </div>

          <!-- Carousel Previews -->
          <div id="carouselPreviewGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-3"></div>

          <!-- Post Text Preview -->
          <div class="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p class="text-xs text-cyan-400 font-semibold mb-1">ক্যাপশন প্রিভিউ:</p>
            <pre id="previewCaption" class="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed"></pre>
          </div>

          <!-- First Comment Preview -->
          <div class="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p class="text-xs text-amber-400 font-semibold mb-1">🔗 ফার্স্ট কমেন্ট প্রিভিউ (অ্যালগরিদম রিচ হ্যাক):</p>
            <pre id="previewFirstComment" class="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed"></pre>
          </div>
        </div>
      </section>

      <!-- Content Grid: Recent Posts & Comments -->
      <section class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <!-- Left: Published Posts (2 Cols) -->
        <div class="lg:col-span-2 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-slate-200 flex items-center gap-2">
              <span>📸 সম্প্রতি পাবলিশ হওয়া পোস্টসমূহ</span>
              <span class="text-xs px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full">${recentPosts.length}</span>
            </h3>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            ${postsHtml}
          </div>
        </div>

        <!-- Right: Recent Comments (1 Col) -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-slate-200 flex items-center gap-2">
              <span>💬 কমেন্ট ও এআই অটো-রিপ্লাই</span>
              <span class="text-xs px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full">${recentComments.length}</span>
            </h3>
          </div>
          <div class="space-y-3">
            ${commentsHtml}
          </div>
        </div>

      </section>
    </main>

    <!-- Client-side script for AJAX triggers -->
    <script>
      async function runPipeline(dryRun) {
        const previewBtn = document.getElementById('previewBtn');
        const liveBtn = document.getElementById('liveBtn');
        const customInput = document.getElementById('customTopicInput');
        const feedback = document.getElementById('liveFeedback');
        const feedbackText = document.getElementById('feedbackText');
        const previewCard = document.getElementById('previewCard');

        const topic = customInput.value.trim();

        previewBtn.disabled = true;
        liveBtn.disabled = true;
        feedback.classList.remove('hidden');
        feedbackText.className = 'text-cyan-400 font-medium';
        feedbackText.innerText = dryRun
          ? '🧪 এআই টপিক অ্যানালাইসিস, ফ্যাক্ট-চেক ও ৩ডি ব্যানার প্রস্তুত করছে (ফেসবুকে পোস্ট ছাড়া)... দয়া করে ৩০ সেকেন্ড অপেক্ষা করুন।'
          : '🚀 লাইভ পোস্ট প্রস্তুত হচ্ছে এবং ফেসবুকে আপলোড হচ্ছে... দয়া করে ৩০-৪০ সেকেন্ড অপেক্ষা করুন।';

        try {
          const res = await fetch('/test-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, dryRun }),
          });
          const json = await res.json();

          if (json.success) {
            if (dryRun) {
              feedbackText.innerText = '✅ ড্রাফট সফলভাবে তৈরি হয়েছে! নিচে প্রিভিউ দেখুন (ফেসবুকে কোনো পোস্ট করা হয়নি)।';
              feedbackText.className = 'text-emerald-400 font-bold';

              // Populate preview card
              document.getElementById('criticScoreBadge').innerText = 'Critic Score: ' + (json.data.criticAudit?.score || 95) + '/100';
              document.getElementById('previewCaption').innerText = json.data.content;
              document.getElementById('previewFirstComment').innerText = json.data.firstCommentText || 'কোনো ফার্স্ট কমেন্ট নেই';

              const grid = document.getElementById('carouselPreviewGrid');
              grid.innerHTML = (json.data.imageUrls || []).map((url, i) =>
                '<div><p class="text-[11px] text-slate-400 mb-1">Slide ' + (i+1) + '</p><img src="' + url + '" class="w-full h-44 object-cover rounded-xl border border-slate-700 shadow" /></div>'
              ).join('');

              previewCard.classList.remove('hidden');
            } else {
              feedbackText.innerHTML = '✅ পোস্ট সফলভাবে ফেসবুকে পাবলিশ হয়েছে! পোস্ট আইডি: ' + json.data.postId + '। ৩ সেকেন্ডে রিলোড হচ্ছে...';
              feedbackText.className = 'text-emerald-400 font-bold';
              setTimeout(() => window.location.reload(), 3000);
            }
          } else {
            feedbackText.innerText = '❌ এরর: ' + (json.error || 'Operation failed');
            feedbackText.className = 'text-red-400 font-bold';
          }
        } catch (err) {
          feedbackText.innerText = '❌ নেটওয়ার্ক ত্রুটি: ' + err.message;
          feedbackText.className = 'text-red-400 font-bold';
        } finally {
          previewBtn.disabled = false;
          liveBtn.disabled = false;
        }
      }
    </script>
  </body>
  </html>
  `;

  res.status(200).send(html);
});

/**
 * Manual trigger endpoint for testing content generation and Facebook publishing
 * Supports dryRun: true to simulate without publishing to Facebook
 * Route: POST /test-post
 */
app.post('/test-post', async (req: Request, res: Response) => {
  try {
    const customTopic = req.body?.topic as string | undefined;
    const dryRun = Boolean(req.body?.dryRun);

    console.log(`[Manual Trigger] Request received. Topic: ${customTopic ? `"${customTopic}"` : 'Autonomous AI Trend'}, DryRun: ${dryRun}`);

    const result = await triggerManualPost(customTopic, dryRun);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: dryRun
          ? 'Content generated and simulated successfully (No Facebook post made).'
          : 'Content generated and published to Facebook successfully!',
        data: result,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to complete execution flow.',
      error: result.error,
      data: result,
    });
  } catch (error: any) {
    console.error('[Manual Trigger Exception]', error);
    res.status(500).json({
      success: false,
      message: 'Unexpected server error while processing request.',
      error: error.message || 'Internal Server Error',
    });
  }
});

/**
 * Dedicated Safe Simulation Endpoint (Zero Facebook posting)
 * Route: POST /api/simulate-draft
 */
app.post('/api/simulate-draft', async (req: Request, res: Response) => {
  try {
    const customTopic = req.body?.topic as string | undefined;
    const result = await triggerManualPost(customTopic, true);
    res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 404 Route Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint Not Found',
    availableEndpoints: ['GET /', 'GET /health', 'GET /webhook', 'POST /webhook', 'POST /test-post', 'POST /api/simulate-draft'],
  });
});

// Global Error Handling Middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Unhandled Server Error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'Something went wrong',
  });
});

// Bootstrap server and scheduler
const startServer = () => {
  validateEnv(false);

  // Initialize the cron publisher & analytics tasks
  const { publisherTask, analyticsTask } = initPublisherJob();

  // Start HTTP server
  const server = app.listen(env.PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 ByteBangla 100% Autonomous Content Hub is live!`);
    console.log(`📡 URL: http://localhost:${env.PORT}`);
    console.log(`🛡️  Environment: ${env.NODE_ENV}`);
    console.log(`🕒 Cron Schedule: "${env.CRON_SCHEDULE}" (Asia/Dhaka)`);
    console.log(`======================================================\n`);
  });

  // Graceful shutdown handlers
  const shutdown = (signal: string) => {
    console.log(`\n[Process] ${signal} signal received: closing server & cron jobs...`);
    publisherTask.stop();
    analyticsTask.stop();
    server.close(() => {
      console.log('[Process] Server closed gracefully.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer();

export default app;
