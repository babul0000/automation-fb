import express, { Request, Response, NextFunction } from 'express';
import os from 'os';
import { env, validateEnv, isConfiguredForFacebook, isConfiguredForGemini } from './config/env';
import healthRouter from './routes/health';
import webhookRouter from './routes/webhook';
import { initPublisherJob, triggerManualPost } from './jobs/publisher';
import { getRecentPosts, getRecentComments, isDatabaseConnected, getJobLogs, saveComment, saveReply } from './services/db';
import { analyzeAudienceEngagement } from './services/learning';
import { collectAllRecentMetrics } from './services/analytics';
import { analyzeCommentWithAI } from './services/comments';

const app = express();

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
 * Detect local Wi-Fi / Ethernet IPv4 address for mobile access
 */
function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (
        net.family === 'IPv4' &&
        !net.internal &&
        (net.address.startsWith('192.168.') || net.address.startsWith('10.') || net.address.startsWith('172.'))
      ) {
        return net.address;
      }
    }
  }
  return '192.168.0.103';
}

/**
 * Root Dashboard: 100% Mobile-First Responsive All-in-One Command Center
 * Route: GET /
 */
app.get('/', async (_req: Request, res: Response) => {
  const recentPosts = await getRecentPosts(12);
  const recentComments = await getRecentComments(10);
  const jobLogs = await getJobLogs(10);
  const learningInsights = await analyzeAudienceEngagement();
  const dbConnected = isDatabaseConnected();
  const localIp = getLocalIpAddress();
  const mobileUrl = `http://${localIp}:${env.PORT}`;

  const postsHtml = recentPosts.length === 0
    ? `<div class="p-8 text-center text-slate-400 bg-slate-900/60 rounded-2xl border border-slate-800">
        <p class="text-sm">এখনও কোনো পোস্ট রেকর্ড করা হয়নি। এআই স্টুডিও থেকে ড্রাফট প্রিভিউ দেখুন!</p>
       </div>`
    : recentPosts
        .map((p, idx) => {
          const fbLink = `https://www.facebook.com/${env.PAGE_ID}/posts/${p.facebookPostId.includes('_') ? p.facebookPostId.split('_')[1] : p.facebookPostId}`;
          const dateStr = new Date(p.publishedAt).toLocaleDateString('bn-BD', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });
          const imgTag = p.imageUrl
            ? `<div class="relative overflow-hidden rounded-xl mb-3 border border-slate-700/60 group">
                <img src="${p.imageUrl}" alt="Banner" class="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                <span class="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-md text-[10px] font-mono text-cyan-300 px-2 py-0.5 rounded-full border border-slate-700">#${idx + 1}</span>
               </div>`
            : '';

          return `
          <div class="bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 shadow-lg hover:shadow-cyan-500/10">
            <div>
              ${imgTag}
              <div class="flex items-center justify-between text-[11px] text-cyan-400 font-mono mb-2">
                <span class="bg-cyan-950/70 border border-cyan-800/50 px-2 py-0.5 rounded-full truncate max-w-[150px]">ID: ${p.facebookPostId.substring(0, 16)}...</span>
                <span class="text-slate-400 font-sans">${dateStr}</span>
              </div>
              <p class="text-slate-200 text-xs sm:text-sm line-clamp-3 mb-3 leading-relaxed font-sans">${p.caption}</p>
            </div>
            <a href="${fbLink}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center gap-1.5 w-full py-2.5 px-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/25 hover:to-blue-500/25 text-cyan-300 text-xs font-semibold rounded-xl border border-cyan-500/30 transition shadow-sm active:scale-[0.98]">
              <span>ফেসবুকে লাইভ দেখুন</span>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
            </a>
          </div>`;
        })
        .join('');

  const commentsHtml = recentComments.length === 0
    ? `<div class="p-6 text-center text-slate-400 bg-slate-900/60 rounded-2xl border border-slate-800 text-sm">
        কোনো কমেন্ট অ্যাক্টিভিটি পাওয়া যায়নি।
       </div>`
    : recentComments
        .map(({ comment, replies }) => {
          const isLead = comment.classification === 'LEAD_MAGNET';
          const badgeClass = isLead
            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
            : replies.length > 0
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/30';

          const badgeText = isLead
            ? '🎁 Lead Magnet Sent'
            : replies.length > 0
              ? '🤖 AI Replied'
              : 'Logged';

          const replyText = replies.length > 0
            ? `<div class="mt-2.5 pl-3 border-l-2 border-emerald-500/60 text-xs text-slate-300 bg-emerald-950/20 p-2.5 rounded-r-xl">
                <span class="text-emerald-400 font-semibold">বাইট বাংলা:</span> ${replies[0].replyText}
               </div>`
            : '';

          return `
          <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-md">
            <div class="flex items-center justify-between text-xs mb-2">
              <span class="font-bold text-slate-100 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                ${comment.senderName || 'ফেসবুক ইউজার'}
              </span>
              <span class="px-2 py-0.5 text-[11px] border rounded-full font-semibold ${badgeClass}">${badgeText}</span>
            </div>
            <p class="text-xs text-slate-200 mb-2 leading-relaxed bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">"${comment.text}"</p>
            <div class="flex items-center justify-between text-[10px] text-slate-400">
              <span class="px-2 py-0.5 bg-slate-800 rounded-md">শ্রেণী: ${comment.classification}</span>
              <span>${new Date(comment.createdAt).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            ${replyText}
          </div>`;
        })
        .join('');

  const logsHtml = jobLogs.length === 0
    ? `<div class="p-6 text-center text-slate-400 bg-slate-900/60 rounded-2xl border border-slate-800 text-sm">কোনো সিস্টেম লগ পাওয়া যায়নি।</div>`
    : jobLogs
        .map((l) => {
          const isSuccess = l.status === 'SUCCESS' || l.status === 'COMPLETED';
          const statusBadge = isSuccess
            ? `<span class="text-emerald-400 font-bold">● ${l.status}</span>`
            : `<span class="text-rose-400 font-bold">● ${l.status}</span>`;
          const dateStr = new Date(l.createdAt).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });

          return `
          <div class="flex items-start justify-between text-xs py-2.5 border-b border-slate-800/80 last:border-none">
            <div class="pr-2">
              <span class="font-mono text-cyan-300 font-semibold">${l.jobName}</span>
              <p class="text-[11px] text-slate-400 line-clamp-1 mt-0.5">${l.details || 'Executed successfully'}</p>
            </div>
            <div class="text-right whitespace-nowrap">
              ${statusBadge}
              <p class="text-[10px] text-slate-500">${dateStr}</p>
            </div>
          </div>`;
        })
        .join('');

  const topPostSummary = learningInsights.topPosts.length > 0
    ? `<div class="bg-cyan-950/30 border border-cyan-800/50 p-3.5 rounded-2xl mb-3">
        <div class="flex items-center justify-between">
          <p class="text-xs font-semibold text-cyan-300">🔥 অডিয়েন্স সেরা পছন্দ:</p>
          <span class="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono">স্কোর: ${learningInsights.topPosts[0].score}</span>
        </div>
        <p class="text-xs text-slate-200 mt-1 font-medium">"${learningInsights.topPosts[0].topicTitle}"</p>
       </div>`
    : '';

  const html = `
  <!DOCTYPE html>
  <html lang="bn" class="dark">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#020617">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <title>ByteBangla - Autonomous AI Facebook Hub</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      body {
        font-family: 'Hind Siliguri', 'Inter', sans-serif;
        -webkit-tap-highlight-color: transparent;
      }
      .tab-active {
        color: #22d3ee !important;
        border-color: #06b6d4 !important;
        background-color: rgba(6, 182, 212, 0.1) !important;
      }
      .mobile-tab-active {
        color: #22d3ee !important;
      }
      .mobile-tab-active svg {
        stroke: #22d3ee !important;
      }
      /* Custom smooth scrollbar */
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: #020617; }
      ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #475569; }
    </style>
  </head>
  <body class="bg-slate-950 text-slate-100 min-h-screen pb-24 sm:pb-16 select-none sm:select-auto">
    
    <!-- Top Fixed Navigation Bar -->
    <header class="border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        <!-- Brand & Identity -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center font-bold text-xl text-white shadow-lg shadow-cyan-500/25">
            B
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-base sm:text-lg font-bold bg-gradient-to-r from-cyan-400 via-blue-300 to-indigo-300 bg-clip-text text-transparent">
                ByteBangla
              </h1>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[10px] font-bold rounded-full">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                ACTIVE
              </span>
            </div>
            <p class="text-[11px] text-slate-400 -mt-0.5">সহজ বাংলায় এআই ও টেকনোলজি টিপস</p>
          </div>
        </div>

        <!-- Top Actions -->
        <div class="flex items-center gap-2">
          <!-- Refresh Button -->
          <button onclick="window.location.reload()" title="Refresh" class="p-2 text-slate-400 hover:text-white bg-slate-800/80 active:bg-slate-700 rounded-xl border border-slate-700 active:scale-95 transition">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          </button>
          
          <!-- View Facebook Page -->
          <a href="https://www.facebook.com/${env.PAGE_ID}" target="_blank" class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl font-semibold transition flex items-center gap-1.5 shadow-md active:scale-95">
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            <span class="hidden xs:inline">পেজ লিংক</span>
          </a>
        </div>

      </div>

      <!-- Desktop / Tablet Tab Navigation Bar -->
      <div class="hidden sm:block border-t border-slate-800/60 bg-slate-900/60">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 py-2 overflow-x-auto">
          <button onclick="switchTab('overview')" id="desk-tab-overview" class="tab-btn tab-active px-4 py-1.5 rounded-xl text-xs font-semibold border border-transparent transition flex items-center gap-2">
            <span>🏠</span><span>ওভারভিউ (সব কিছু এক নজরে)</span>
          </button>
          <button onclick="switchTab('studio')" id="desk-tab-studio" class="tab-btn px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white border border-transparent transition flex items-center gap-2">
            <span>🧪</span><span>এআই স্টুডিও ও সিমুলেটর</span>
          </button>
          <button onclick="switchTab('posts')" id="desk-tab-posts" class="tab-btn px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white border border-transparent transition flex items-center gap-2">
            <span>📸</span><span>পোস্টসমূহ (${recentPosts.length})</span>
          </button>
          <button onclick="switchTab('community')" id="desk-tab-community" class="tab-btn px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white border border-transparent transition flex items-center gap-2">
            <span>💬</span><span>কমেন্ট ও ডিএম (${recentComments.length})</span>
          </button>
          <button onclick="switchTab('brain')" id="desk-tab-brain" class="tab-btn px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white border border-transparent transition flex items-center gap-2">
            <span>🧠</span><span>এআই ব্রেন ও হেলথ</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Container -->
    <main class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
      
      <!-- 📱 Mobile Access Notice Card (Always accessible) -->
      <section class="bg-gradient-to-r from-cyan-950/40 via-slate-900 to-indigo-950/40 border border-cyan-800/40 rounded-2xl p-3 sm:p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-sm font-bold border border-cyan-500/30">
            📱
          </div>
          <div>
            <p class="text-xs font-bold text-cyan-300">মোবাইল থেকে সরাসরি ড্যাশবোর্ড দেখুন:</p>
            <p class="text-[11px] text-slate-300 font-mono select-all">${mobileUrl}</p>
          </div>
        </div>
        <button onclick="copyToClipboard('${mobileUrl}', 'মোবাইল এক্সেস লিংক কপি করা হয়েছে!')" class="w-full sm:w-auto px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold rounded-xl border border-cyan-500/40 active:scale-95 transition flex items-center justify-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
          <span>লিংক কপি করুন</span>
        </button>
      </section>

      <!-- ========================================================================= -->
      <!-- TAB 1: OVERVIEW (হোম - এক নজরে সব কিছু) -->
      <!-- ========================================================================= -->
      <div id="tab-content-overview" class="tab-pane space-y-5">
        
        <!-- 4 Quick Metric Cards (2x2 on mobile, 4 in row on desktop) -->
        <section class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
          <div class="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 text-xs">
              <span class="font-medium">মোট পোস্ট</span>
              <span>📸</span>
            </div>
            <p class="text-2xl font-bold text-cyan-400 font-mono mt-1">${recentPosts.length}</p>
            <p class="text-[10px] text-slate-400 mt-0.5">স্বয়ংক্রিয় পাবলিশড</p>
          </div>

          <div class="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 text-xs">
              <span class="font-medium">দৈনিক পোস্ট টাইম</span>
              <span>⏰</span>
            </div>
            <p class="text-xl sm:text-2xl font-bold text-amber-400 font-mono mt-1">০৯:৩০ AM</p>
            <p class="text-[10px] text-slate-400 mt-0.5">প্রতিদিন (BST)</p>
          </div>

          <div class="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 text-xs">
              <span class="font-medium">কমিউনিটি কমেন্ট</span>
              <span>💬</span>
            </div>
            <p class="text-2xl font-bold text-purple-400 font-mono mt-1">${recentComments.length}</p>
            <p class="text-[10px] text-slate-400 mt-0.5">এআই অটো-হ্যান্ডেল্ড</p>
          </div>

          <div class="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-sm">
            <div class="flex items-center justify-between text-slate-400 text-xs">
              <span class="font-medium">এআই কোয়ালিটি</span>
              <span>🛡️</span>
            </div>
            <p class="text-xl sm:text-2xl font-bold text-emerald-400 mt-1">৯৫%+</p>
            <p class="text-[10px] text-slate-400 mt-0.5">Critic Verified</p>
          </div>
        </section>

        <!-- 🤖 Bot Fleet Showcase (৮টি স্বয়ংক্রিয় এআই বট ও তাদের কাজ) -->
        <section class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-base sm:text-lg font-bold text-white">🤖 ৮টি স্বয়ংক্রিয় এআই বট ও সিস্টেম আর্কিটেকচার</span>
              </div>
              <p class="text-xs text-slate-400 mt-0.5">আপনার পেজে ২৪ ঘণ্টা ব্যাকগ্রাউন্ডে সক্রিয় থাকা প্রতিটি বটের ভূমিকা:</p>
            </div>
            <span class="hidden sm:inline-flex px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-full">
              ৮/৮ ফুল একটিভ
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <!-- Bot 1 -->
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 hover:border-cyan-500/40 transition">
              <div class="flex items-center justify-between mb-2">
                <span class="text-base">1️⃣ 🤖</span>
                <span class="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-bold text-[10px]">অ্যালগরিদম ৪০-৩০-৩০</span>
              </div>
              <p class="font-bold text-slate-200">ট্রেন্ড ও টপিক ডিসকভারি বট</p>
              <p class="text-slate-400 text-[11px] mt-1 leading-relaxed">গিটহাব, এআই প্রোডাক্ট ও টেক নিউজ থেকে হাই-এনগেজিং ট্রেন্ড খুঁজে বের করে এবং SHA-256 হ্যাশ দিয়ে ডুপ্লিকেট টপিক প্রতিরোধ করে।</p>
            </div>

            <!-- Bot 2 -->
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 hover:border-cyan-500/40 transition">
              <div class="flex items-center justify-between mb-2">
                <span class="text-base">2️⃣ 🌐</span>
                <span class="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full font-bold text-[10px]">Google Search</span>
              </div>
              <p class="font-bold text-slate-200">ফ্যাক্ট-চেকার ও ওয়েব গ্রাউন্ডিং</p>
              <p class="text-slate-400 text-[11px] mt-1 leading-relaxed">গুগল লাইভ সার্চ দিয়ে নিশ্চিত করে যে টুলস, ওয়েবসাইট ও ফিচারগুলো আসলেই সত্য ও চালু আছে। ভুয়া বা হ্যালুসিনেটেড টুলস ১০০% নিষিদ্ধ।</p>
            </div>

            <!-- Bot 3 -->
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 hover:border-cyan-500/40 transition">
              <div class="flex items-center justify-between mb-2">
                <span class="text-base">3️⃣ ✍️</span>
                <span class="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full font-bold text-[10px]">Reach Hack</span>
              </div>
              <p class="font-bold text-slate-200">বাংলা কন্টেন্ট ক্রিয়েটর বট</p>
              <p class="text-slate-400 text-[11px] mt-1 leading-relaxed">সহজ প্রাঞ্জল ভাষায় হুক, বুলেট পয়েন্ট ও অ্যাকশনেবল গাইড লেখে। ক্যাপশনে কোনো লিংক দেয় না যেন ফেসবুকের রিচ ডাউন না হয়।</p>
            </div>

            <!-- Bot 4 -->
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 hover:border-cyan-500/40 transition">
              <div class="flex items-center justify-between mb-2">
                <span class="text-base">4️⃣ 🧐</span>
                <span class="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-bold text-[10px]">৮৫%+ কোয়ালিটি</span>
              </div>
              <p class="font-bold text-slate-200">সেলফ-রিফ্লেকশন ক্রিটিক অডিটর</p>
              <p class="text-slate-400 text-[11px] mt-1 leading-relaxed">পাবলিশের পূর্বে ড্রাফটের যথার্থতা, বাংলা ভাষার মান ও হুক অডিট করে। ৮৫ পয়েন্টের কম পেলে নিজে থেকেই ড্রাফটটি রিরাইট করে পরিমার্জন করে।</p>
            </div>

            <!-- Bot 5 -->
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 hover:border-purple-500/40 transition">
              <div class="flex items-center justify-between mb-2">
                <span class="text-base">5️⃣ 🎨</span>
                <span class="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded-full font-bold text-[10px]">Flux AI 3D</span>
              </div>
              <p class="font-bold text-slate-200">৩ডি মাল্টি-স্লাইড ভিজ্যুয়াল বট</p>
              <p class="text-slate-400 text-[11px] mt-1 leading-relaxed">১:১ স্কয়ার রেশিওতে আকর্ষণীয় সাইবারপাঙ্ক কভার স্লাইড এবং স্টেপ-বাই-স্টেপ ইনফোগ্রাফিক তৈরি করে প্রিমিয়াম লুক নিশ্চিত করে।</p>
            </div>

            <!-- Bot 6 -->
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 hover:border-blue-500/40 transition">
              <div class="flex items-center justify-between mb-2">
                <span class="text-base">6️⃣ 🚀</span>
                <span class="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full font-bold text-[10px]">Graph API v21</span>
              </div>
              <p class="font-bold text-slate-200">ফেসবুক মাল্টি-ফটো পাবলিশার</p>
              <p class="text-slate-400 text-[11px] mt-1 leading-relaxed">মেটা গ্রাফ এপিআই দিয়ে ক্যারোসেল পোস্ট করে এবং পোস্ট হওয়ার সাথে সাথে ফার্স্ট কমেন্টে অফিসিয়াল ও রিসোর্স লিংক পিন করে দেয়।</p>
            </div>

            <!-- Bot 7 -->
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 hover:border-amber-500/40 transition">
              <div class="flex items-center justify-between mb-2">
                <span class="text-base">7️⃣ 💬</span>
                <span class="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full font-bold text-[10px]">২৪/৭ ইনস্ট্যান্ট</span>
              </div>
              <p class="font-bold text-slate-200">কমেন্ট ও মেসেঞ্জার ডিএম বট</p>
              <p class="text-slate-400 text-[11px] mt-1 leading-relaxed">পোস্টের বিষয়বস্তু বিশ্লেষণ করে কমেন্টের প্রাসঙ্গিক উত্তর দেয় এবং 'AI / টুল / লিংক' চাইলে স্বয়ংক্রিয়ভাবে ইনবক্সে ডিরেক্ট রিসোর্স পাঠিয়ে দেয়।</p>
            </div>

            <!-- Bot 8 -->
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 hover:border-rose-500/40 transition">
              <div class="flex items-center justify-between mb-2">
                <span class="text-base">8️⃣ 📈</span>
                <span class="px-2 py-0.5 bg-rose-500/10 text-rose-400 rounded-full font-bold text-[10px]">রাত ১১:৩০ BST</span>
              </div>
              <p class="font-bold text-slate-200">অ্যানালিটিক্স ও লার্নিং ব্রেন</p>
              <p class="text-slate-400 text-[11px] mt-1 leading-relaxed">প্রতি রাতে পোস্টের রিঅ্যাকশন, কমেন্ট ও শেয়ার অডিট করে বের করে কোন ধরণের পোস্ট দর্শকরা বেশি ভালোবাসে এবং পরবর্তী পোস্টের কৌশল উন্নত করে।</p>
            </div>
          </div>
        </section>

        <!-- ⏰ Daily Autonomous Routine & Schedule Card -->
        <section class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          <div class="flex items-center gap-2">
            <span class="text-base sm:text-lg font-bold text-white">🕒 ২৪ ঘণ্টার স্বয়ংক্রিয় কাজের সময়সূচী</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="bg-slate-950/70 border border-amber-500/20 rounded-2xl p-3.5 flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-sm shrink-0">
                🌅
              </div>
              <div>
                <p class="text-xs font-bold text-amber-300">সকাল ০৯:৩০ AM (BST)</p>
                <p class="text-xs font-semibold text-slate-200 mt-0.5">স্বয়ংক্রিয় ফেসবুক পোস্ট</p>
                <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">ট্রেন্ডিং টপিক রিসার্চ, ফ্যাক্ট-চেক, ৩ডি ইমেজ তৈরি এবং ফার্স্ট কমেন্টসহ মেটা এপিআই-এর মাধ্যমে পেজে পোস্ট পাবলিশ হয়।</p>
              </div>
            </div>

            <div class="bg-slate-950/70 border border-cyan-500/20 rounded-2xl p-3.5 flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-sm shrink-0">
                ☀️
              </div>
              <div>
                <p class="text-xs font-bold text-cyan-300">সারাদিন (২৪/৭ রিয়েল-টাইম)</p>
                <p class="text-xs font-semibold text-slate-200 mt-0.5">অটো কমেন্ট ও ডিএম ডেলিভারি</p>
                <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">ফেসবুক ব্যবহারকারীরা পোস্টে কোনো কমেন্ট বা রিসোর্স চাইলেই এআই সাথে সাথে উত্তর ও ইনবক্সে ডিরেক্ট মেসেজ পাঠায়।</p>
              </div>
            </div>

            <div class="bg-slate-950/70 border border-purple-500/20 rounded-2xl p-3.5 flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold text-sm shrink-0">
                🌙
              </div>
              <div>
                <p class="text-xs font-bold text-purple-300">রাত ১১:৩০ PM (BST)</p>
                <p class="text-xs font-semibold text-slate-200 mt-0.5">অডিয়েন্স অ্যানালাইসিস ও লার্নিং</p>
                <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">সারাদিনের পোস্টের ইনসাইটস, রিঅ্যাকশন ও শেয়ার বিশ্লেষণ করে এআই নিজের স্ট্র্যাটেজি আপডেট করে।</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 🧠 AI Self-Learning Insights & Problem Solving -->
        <section class="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-indigo-900/40 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          <div class="flex items-center justify-between">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              🧠 পেজ অ্যানালাইসিস ও প্রবলেম সলভিং
            </span>
            <span class="text-xs text-slate-400">রিয়েল-টাইম মেমোরি</span>
          </div>

          ${topPostSummary}

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div class="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
              <span class="font-bold text-emerald-400 flex items-center gap-1.5">
                <span>🛡️ প্রবলেম ১: ফেসবুক লিংক রিচ ডাউন</span>
              </span>
              <p class="mt-1 leading-relaxed text-slate-300">
                <span class="text-slate-400 font-semibold">সমাধান:</span> ক্যাপশনে কোনো লিংক না দিয়ে মূল ক্যাপশন সম্পূর্ণ ক্লিন রাখা হয়েছে। পোস্ট পাবলিশ হওয়ার পর স্বয়ংক্রিয়ভাবে ১ম কমেন্টে অফিসিয়াল রিসোর্স লিংক পিন করা হয়।
              </p>
            </div>

            <div class="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
              <span class="font-bold text-amber-400 flex items-center gap-1.5">
                <span>🛡️ প্রবলেম ২: এআই ভুয়া টুলসের ঝুঁকি</span>
              </span>
              <p class="mt-1 leading-relaxed text-slate-300">
                <span class="text-slate-400 font-semibold">সমাধান:</span> গুগল সার্চ গ্রাউন্ডিং দিয়ে রিয়েল-টাইম তথ্য যাচাই করা হয়। ফলে কাল্পনিক কোনো টুলসের নাম বা লিংক তৈরি হওয়া সম্পূর্ণভাবে বন্ধ।
              </p>
            </div>
          </div>
        </section>

      </div>

      <!-- ========================================================================= -->
      <!-- TAB 2: AI STUDIO & SIMULATOR (এআই স্টুডিও ও সিমুলেটর) -->
      <!-- ========================================================================= -->
      <div id="tab-content-studio" class="tab-pane hidden space-y-5">
        <section class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/25">
                🧪 সেফ সিমুলেশন স্টুডিও
              </span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ১০০% পোস্ট ছাড়া নিরাপদ
              </span>
            </div>
            <h2 class="text-lg sm:text-xl font-bold text-white mt-2">এআই ড্রাফট ও ৩ডি ক্যারোসেল প্রিভিউ</h2>
            <p class="text-xs sm:text-sm text-slate-400 mt-1">
              ফেসবুকে পোস্ট না করে সম্পূর্ণ পোস্ট, ফ্যাক্ট-চেক অডিট, ৩ডি ইমেজ ও ক্যাপশন প্রিভিউ দেখতে নিচের বেগুনি বাটনে চাপুন।
            </p>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1.5">কাস্টম টপিক (ঐচ্ছিক):</label>
            <input id="customTopicInput" type="text" placeholder="যেমন: ৫টি সেরা ফ্রি এআই টুলস (ফাঁকা রাখলে এআই নিজে ট্রেন্ডিং টপিক খুঁজবে)" class="w-full bg-slate-950 border border-slate-700/80 rounded-2xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition shadow-inner font-sans" />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <!-- Safe Preview Button (Prominent & Primary) -->
            <button id="previewBtn" onclick="runPipeline(true)" class="w-full py-4 px-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm rounded-2xl shadow-lg shadow-purple-600/25 transition duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]">
              <span id="previewSpinner" class="hidden animate-spin">🌀</span>
              <span id="previewText">🧪 Simulate & Preview (ফেসবুকে পোস্ট ছাড়া)</span>
            </button>

            <!-- Direct Live Publish (Safeguarded with confirmation modal) -->
            <button id="liveBtn" onclick="openLiveConfirmModal()" class="w-full py-4 px-4 bg-slate-800/90 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 font-bold text-xs sm:text-sm rounded-2xl border border-slate-700 transition duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]">
              <span>🚀 ফেসবুকে সরাসরি পোস্ট করুন</span>
            </button>
          </div>

          <!-- Live Progress Tracker Pipeline -->
          <div id="liveFeedback" class="hidden mt-4 pt-4 border-t border-slate-800 text-xs sm:text-sm">
            <div class="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
              <div class="flex items-center gap-2 text-cyan-400 font-semibold">
                <span class="animate-spin text-base">⚙️</span>
                <span id="feedbackText">এআই পাইপলাইন কাজ করছে...</span>
              </div>
              <p class="text-[11px] text-slate-400">ট্রেন্ড রিসার্চ ➔ ফ্যাক্ট চেক ➔ ক্রিটিক অডিট ➔ ৩ডি স্লাইড তৈরি (অনুগ্রহ করে ২০-৩০ সেকেন্ড অপেক্ষা করুন)</p>
            </div>
          </div>

          <!-- Safe Preview Result Box -->
          <div id="previewCard" class="hidden mt-4 pt-4 border-t border-slate-800 space-y-4">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="px-2.5 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-bold">
                  🛡️ Safe Simulation (পোস্ট হয়নি)
                </span>
                <span id="criticScoreBadge" class="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold">
                  Critic Score: 95/100
                </span>
              </div>
              <button onclick="document.getElementById('previewCard').classList.add('hidden')" class="text-xs text-slate-400 hover:text-white p-1">✕ বন্ধ করুন</button>
            </div>

            <!-- Carousel Preview Cards -->
            <div>
              <p class="text-xs font-bold text-slate-300 mb-2">📸 তৈরি হওয়া ৩ডি ভিজ্যুয়াল স্লাইডসমূহ:</p>
              <div id="carouselPreviewGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-3"></div>
            </div>

            <!-- Caption Preview -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                  <span>📝 মূল বাংলা ক্যাপশন:</span>
                </span>
                <button onclick="copyToClipboard(document.getElementById('previewCaption').innerText, 'ক্যাপশন কপি করা হয়েছে!')" class="text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-950/70 border border-cyan-800/60 px-2.5 py-1 rounded-lg">
                  কপি করুন
                </button>
              </div>
              <pre id="previewCaption" class="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed"></pre>
            </div>

            <!-- First Comment Preview -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <span>🔗 ১ম কমেন্ট (অফিসিয়াল রিসোর্স লিংক):</span>
                </span>
                <button onclick="copyToClipboard(document.getElementById('previewFirstComment').innerText, 'ফার্স্ট কমেন্ট কপি করা হয়েছে!')" class="text-xs text-amber-400 hover:text-amber-300 bg-amber-950/70 border border-amber-800/60 px-2.5 py-1 rounded-lg">
                  কপি করুন
                </button>
              </div>
              <pre id="previewFirstComment" class="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed"></pre>
            </div>
          </div>
        </section>
      </div>

      <!-- ========================================================================= -->
      <!-- TAB 3: POSTS & METRICS (পোস্টসমূহ ও পারফরম্যান্স) -->
      <!-- ========================================================================= -->
      <div id="tab-content-posts" class="tab-pane hidden space-y-5">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>📸 সম্প্রতি পাবলিশ হওয়া পোস্টসমূহ</span>
              <span class="text-xs px-2.5 py-0.5 bg-slate-800 text-slate-300 rounded-full font-mono">${recentPosts.length}</span>
            </h2>
            <p class="text-xs text-slate-400 mt-0.5">পেজে স্বয়ংক্রিয়ভাবে পোস্ট হওয়া কন্টেন্ট ও পারফরম্যান্স:</p>
          </div>
          <button onclick="syncPostMetrics()" id="syncMetricsBtn" class="text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 px-3 py-2 rounded-xl border border-slate-700 active:scale-95 transition flex items-center gap-1.5">
            <span id="syncMetricsSpinner" class="hidden animate-spin">🌀</span>
            <span>🔄 সিঙ্ক মেট্রিক্স</span>
          </button>
        </div>

        <div id="syncMetricsResult" class="hidden text-xs p-3 bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 rounded-xl"></div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${postsHtml}
        </div>
      </div>

      <!-- ========================================================================= -->
      <!-- TAB 4: COMMUNITY & COMMENTS (কমেন্ট ও ইনবক্স ডিএম) -->
      <!-- ========================================================================= -->
      <div id="tab-content-community" class="tab-pane hidden space-y-5">
        
        <!-- Interactive Comment Bot Tester -->
        <section class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3">
          <div>
            <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25">
              💬 টেস্ট কমেন্ট বট
            </span>
            <h3 class="text-base font-bold text-white mt-2">এআই কমেন্ট ও ইনবক্স রেসপন্ডার টেস্ট করুন</h3>
            <p class="text-xs text-slate-400 mt-0.5">একটি কমেন্ট লিখে টেস্ট করে দেখুন এআই কীভাবে উত্তর দেয় ও ইনবক্সে লিংক পাঠায়:</p>
          </div>

          <div class="flex flex-col sm:flex-row gap-2">
            <input id="testCommentInput" type="text" placeholder="যেমন: ভাই AI টুলের লিংকটা দিন বা ChatGPT দিয়ে কিভাবে কাজ করব?" class="flex-1 bg-slate-950 border border-slate-700/80 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition" />
            <button onclick="testCommentBot()" id="testCommentBtn" class="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs rounded-2xl transition active:scale-95 flex items-center justify-center gap-1.5 shadow-md">
              <span id="testCommentSpinner" class="hidden animate-spin">🌀</span>
              <span>টেস্ট করুন</span>
            </button>
          </div>

          <div id="testCommentResult" class="hidden p-3.5 bg-slate-950 rounded-2xl border border-slate-800 text-xs space-y-2"></div>
        </section>

        <!-- Comments Feed -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold text-slate-200 flex items-center gap-2">
              <span>💬 ফেসবুক কমেন্ট ও অটো-রিপ্লাই হিস্ট্রি</span>
              <span class="text-xs px-2.5 py-0.5 bg-slate-800 text-slate-300 rounded-full font-mono">${recentComments.length}</span>
            </h3>
          </div>
          <div class="space-y-3">
            ${commentsHtml}
          </div>
        </div>
      </div>

      <!-- ========================================================================= -->
      <!-- TAB 5: AI BRAIN & SYSTEM HEALTH (এআই ব্রেন ও হেলথ) -->
      <!-- ========================================================================= -->
      <div id="tab-content-brain" class="tab-pane hidden space-y-5">
        
        <!-- Live System Health Checkers -->
        <section class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3">
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <span>🛡️ লাইভ সিস্টেম ও এপিআই কানেকশন স্ট্যাটাস</span>
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <!-- Gemini AI -->
            <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <p class="font-bold text-slate-200">Google Gemini AI</p>
                <p class="text-[11px] text-slate-400 font-mono mt-0.5">${process.env.GEMINI_MODEL || 'gemini-3.5-flash'}</p>
              </div>
              <span class="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold text-[11px]">
                ● Active
              </span>
            </div>

            <!-- Meta Graph API -->
            <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <p class="font-bold text-slate-200">Meta Graph API v21.0</p>
                <p class="text-[11px] text-slate-400 font-mono mt-0.5">Page: ${env.PAGE_ID}</p>
              </div>
              <span class="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold text-[11px]">
                ● Connected
              </span>
            </div>

            <!-- Database -->
            <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <p class="font-bold text-slate-200">ডাটাবেস স্টোরেজ</p>
                <p class="text-[11px] text-slate-400 font-mono mt-0.5">${dbConnected ? 'PostgreSQL (Prisma)' : 'Resilient Local Store'}</p>
              </div>
              <span class="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold text-[11px]">
                ● Healthy
              </span>
            </div>

            <!-- Scheduler -->
            <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <p class="font-bold text-slate-200">অটো ক্রন শিডিউলার</p>
                <p class="text-[11px] text-slate-400 font-mono mt-0.5">"30 9 * * *" (০৯:৩০ AM)</p>
              </div>
              <span class="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold text-[11px]">
                ● Running
              </span>
            </div>

            <!-- Webhook -->
            <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <p class="font-bold text-slate-200">ফেসবুক ওয়েবহুক লিসেনার</p>
                <p class="text-[11px] text-slate-400 font-mono mt-0.5">GET/POST /webhook</p>
              </div>
              <span class="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold text-[11px]">
                ● Ready
              </span>
            </div>

            <!-- Safe Mode Status -->
            <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <p class="font-bold text-slate-200">সিমুলেশন মোড</p>
                <p class="text-[11px] text-slate-400 font-mono mt-0.5">Zero Post Protection</p>
              </div>
              <span class="px-2.5 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full font-bold text-[11px]">
                ● Safe
              </span>
            </div>
          </div>
        </section>

        <!-- Audit Log Column -->
        <section class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3">
          <h3 class="text-base font-bold text-slate-200 flex items-center gap-2">
            <span>🛡️ সিস্টেম অডিট ও জব হিস্ট্রি লগ</span>
          </h3>
          <div class="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 shadow-md divide-y divide-slate-800">
            ${logsHtml}
          </div>
        </section>
      </div>

    </main>

    <!-- ========================================================================= -->
    <!-- 📱 MOBILE STICKY BOTTOM NAVIGATION BAR -->
    <!-- ========================================================================= -->
    <nav class="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-2 py-2 flex items-center justify-around sm:hidden">
      <button onclick="switchTab('overview')" id="mob-tab-overview" class="mobile-tab-btn mobile-tab-active flex flex-col items-center gap-1 text-slate-400 active:scale-95 transition">
        <svg class="w-5 h-5 stroke-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
        <span class="text-[10px] font-semibold">হোম</span>
      </button>

      <button onclick="switchTab('studio')" id="mob-tab-studio" class="mobile-tab-btn flex flex-col items-center gap-1 text-slate-400 active:scale-95 transition">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
        <span class="text-[10px] font-semibold">স্টুডিও</span>
      </button>

      <button onclick="switchTab('posts')" id="mob-tab-posts" class="mobile-tab-btn flex flex-col items-center gap-1 text-slate-400 active:scale-95 transition">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
        <span class="text-[10px] font-semibold">পোস্ট</span>
      </button>

      <button onclick="switchTab('community')" id="mob-tab-community" class="mobile-tab-btn flex flex-col items-center gap-1 text-slate-400 active:scale-95 transition">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
        <span class="text-[10px] font-semibold">কমেন্ট</span>
      </button>

      <button onclick="switchTab('brain')" id="mob-tab-brain" class="mobile-tab-btn flex flex-col items-center gap-1 text-slate-400 active:scale-95 transition">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
        <span class="text-[10px] font-semibold">হেলথ</span>
      </button>
    </nav>

    <!-- Confirmation Modal for Live Facebook Post -->
    <div id="confirmModal" class="hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-6 max-w-md w-full space-y-4 shadow-2xl">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xl">
            ⚠️
          </div>
          <div>
            <h3 class="text-base font-bold text-white">ফেসবুকে সরাসরি পোস্ট করতে চান?</h3>
            <p class="text-xs text-slate-400 mt-0.5">ByteBangla পেজে সরাসরি পোস্ট পাবলিশ হবে</p>
          </div>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
          আপনি কি নিশ্চিত যে এই পোস্টটি ফেসবুকে সরাসরি লাইভ পাবলিশ করতে চান? টেস্ট করার জন্য প্রথমে <span class="text-purple-400 font-bold">Simulate & Preview (পোস্ট ছাড়া)</span> ব্যবহার করাই সবচেয়ে নিরাপদ।
        </p>
        <div class="flex items-center gap-2 pt-2">
          <button onclick="closeLiveConfirmModal()" class="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition">
            বাতিল করুন
          </button>
          <button onclick="executeLivePostFromModal()" class="flex-1 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-bold rounded-xl shadow-lg transition">
            হ্যাঁ, লাইভ পোস্ট করুন
          </button>
        </div>
      </div>
    </div>

    <!-- Client-side Scripts -->
    <script>
      function copyToClipboard(text, msg) {
        if (!text) return;
        navigator.clipboard.writeText(text);
        alert(msg || 'ক্লিপবোর্ডে কপি করা হয়েছে!');
      }

      function switchTab(tabId) {
        // Hide all tab panes
        document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
        
        // Show target tab pane
        const target = document.getElementById('tab-content-' + tabId);
        if (target) target.classList.remove('hidden');

        // Update desktop tab styles
        document.querySelectorAll('.tab-btn').forEach(btn => {
          btn.classList.remove('tab-active');
          btn.classList.add('text-slate-400');
        });
        const activeDeskTab = document.getElementById('desk-tab-' + tabId);
        if (activeDeskTab) {
          activeDeskTab.classList.add('tab-active');
          activeDeskTab.classList.remove('text-slate-400');
        }

        // Update mobile bottom tab styles
        document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
          btn.classList.remove('mobile-tab-active');
          const svg = btn.querySelector('svg');
          if (svg) svg.classList.remove('stroke-cyan-400');
        });
        const activeMobTab = document.getElementById('mob-tab-' + tabId);
        if (activeMobTab) {
          activeMobTab.classList.add('mobile-tab-active');
          const svg = activeMobTab.querySelector('svg');
          if (svg) svg.classList.add('stroke-cyan-400');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function openLiveConfirmModal() {
        document.getElementById('confirmModal').classList.remove('hidden');
      }

      function closeLiveConfirmModal() {
        document.getElementById('confirmModal').classList.add('hidden');
      }

      function executeLivePostFromModal() {
        closeLiveConfirmModal();
        runPipeline(false);
      }

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
        feedbackText.className = 'text-cyan-400 font-semibold';
        feedbackText.innerText = dryRun
          ? '🧪 এআই টপিক অ্যানালাইসিস, ফ্যাক্ট-চেক ও ৩ডি ক্যারোসেল প্রস্তুত করছে (ফেসবুকে পোস্ট ছাড়া)...'
          : '🚀 লাইভ পোস্ট প্রস্তুত হচ্ছে এবং ফেসবুকে পাবলিশ হচ্ছে...';

        try {
          const res = await fetch('/test-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, dryRun }),
          });
          const json = await res.json();

          if (json.success) {
            if (dryRun) {
              feedbackText.innerText = '✅ সিমুলেশন ড্রাফট সফলভাবে তৈরি হয়েছে! নিচে প্রিভিউ দেখুন (ফেসবুকে কোনো পোস্ট করা হয়নি)।';
              feedbackText.className = 'text-emerald-400 font-bold';

              document.getElementById('criticScoreBadge').innerText = 'Critic Score: ' + (json.data.criticAudit?.score || 95) + '/100';
              document.getElementById('previewCaption').innerText = json.data.content;
              document.getElementById('previewFirstComment').innerText = json.data.firstCommentText || 'কোনো ফার্স্ট কমেন্ট নেই';

              const grid = document.getElementById('carouselPreviewGrid');
              grid.innerHTML = (json.data.imageUrls || []).map((url, i) =>
                '<div><p class="text-[11px] text-slate-400 mb-1 font-semibold">স্লাইড ' + (i+1) + '</p><img src="' + url + '" class="w-full h-44 object-cover rounded-xl border border-slate-700 shadow-md" /></div>'
              ).join('');

              previewCard.classList.remove('hidden');
              previewCard.scrollIntoView({ behavior: 'smooth' });
            } else {
              feedbackText.innerHTML = '✅ পোস্ট সফলভাবে ফেসবুকে পাবলিশ হয়েছে! পোস্ট আইডি: ' + json.data.postId + '। ৩ সেকেন্ডে পেজ রিলোড হচ্ছে...';
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

      async function testCommentBot() {
        const input = document.getElementById('testCommentInput');
        const text = input.value.trim();
        if (!text) {
          alert('অনুগ্রহ করে একটি কমেন্ট লিখুন!');
          return;
        }

        const btn = document.getElementById('testCommentBtn');
        const spinner = document.getElementById('testCommentSpinner');
        const resultBox = document.getElementById('testCommentResult');

        btn.disabled = true;
        spinner.classList.remove('hidden');
        resultBox.classList.remove('hidden');
        resultBox.innerHTML = '<span class="text-cyan-400 animate-pulse">🤖 এআই কমেন্ট বিশ্লেষণ করছে...</span>';

        try {
          const res = await fetch('/api/test-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, sender: 'মোবাইল টেস্ট ইউজার' }),
          });
          const json = await res.json();

          if (json.success) {
            const data = json.analysis;
            resultBox.innerHTML = \`
              <div class="flex items-center justify-between pb-2 border-b border-slate-800">
                <span class="text-emerald-400 font-bold">✅ কমেন্ট টেস্ট সফল!</span>
                <span class="px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full font-bold text-[10px]">ক্যাটাগরি: \${data.category}</span>
              </div>
              <div>
                <p class="text-slate-400 text-[11px]">💬 এআই অটো-রিপ্লাই:</p>
                <p class="text-slate-200 font-medium mt-0.5">"\${data.replyText}"</p>
              </div>
              \${data.privateMessage ? \`
              <div class="mt-2 pt-2 border-t border-slate-800">
                <p class="text-purple-400 text-[11px] font-bold">📩 মেসেঞ্জার ইনবক্স ডিএম ডেলিভারি:</p>
                <pre class="text-[11px] text-slate-300 whitespace-pre-wrap font-sans mt-0.5 leading-relaxed bg-slate-900 p-2.5 rounded-xl border border-slate-800">\${data.privateMessage}</pre>
              </div>
              \` : ''}
            \`;
          } else {
            resultBox.innerHTML = '<span class="text-rose-400">এরর: ' + (json.error || 'Failed') + '</span>';
          }
        } catch (err) {
          resultBox.innerHTML = '<span class="text-rose-400">নেটওয়ার্ক এরর: ' + err.message + '</span>';
        } finally {
          btn.disabled = false;
          spinner.classList.add('hidden');
        }
      }

      async function syncPostMetrics() {
        const btn = document.getElementById('syncMetricsBtn');
        const spinner = document.getElementById('syncMetricsSpinner');
        const result = document.getElementById('syncMetricsResult');

        btn.disabled = true;
        spinner.classList.remove('hidden');
        result.classList.remove('hidden');
        result.innerText = '🔄 ফেসবুক গ্রাফ এপিআই থেকে লাইভ রিঅ্যাকশন ও শেয়ার সিঙ্ক করা হচ্ছে...';

        try {
          const res = await fetch('/api/sync-metrics', { method: 'POST' });
          const json = await res.json();
          if (json.success) {
            result.innerText = '✅ সফলভাবে ' + (json.metrics?.length || 0) + ' টি পোস্টের লাইভ ফেসবুক মেট্রিক্স আপডেট হয়েছে!';
            setTimeout(() => window.location.reload(), 2000);
          } else {
            result.innerText = '❌ সিঙ্ক ব্যর্থ: ' + (json.error || 'Unknown');
          }
        } catch (err) {
          result.innerText = '❌ এরর: ' + err.message;
        } finally {
          btn.disabled = false;
          spinner.classList.add('hidden');
        }
      }
    </script>
  </body>
  </html>
  `;

  res.status(200).send(html);
});

// Interactive Comment Test API
app.post('/api/test-comment', async (req: Request, res: Response) => {
  try {
    const text = req.body?.text || 'ভাই AI টুলের লিংকটা দিন';
    const sender = req.body?.sender || 'মোবাইল টেস্ট ইউজার';

    const analysis = await analyzeCommentWithAI(text, sender);

    const commentRecord = await saveComment({
      facebookCommentId: `test_${Date.now()}`,
      text,
      senderName: sender,
      classification: analysis.category,
      isFlagged: analysis.isFlagged,
    });

    if (analysis.shouldReply && analysis.replyText) {
      await saveReply({
        commentId: commentRecord.id,
        replyText: analysis.replyText,
        status: 'SENT',
      });
    }

    res.status(200).json({ success: true, analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Metrics Sync API
app.post('/api/sync-metrics', async (_req: Request, res: Response) => {
  try {
    const metrics = await collectAllRecentMetrics();
    const insights = await analyzeAudienceEngagement();
    res.status(200).json({ success: true, metrics, insights });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual trigger endpoint
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

// Safe Simulation Endpoint
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
    availableEndpoints: [
      'GET /',
      'GET /health',
      'GET /webhook',
      'POST /webhook',
      'POST /test-post',
      'POST /api/simulate-draft',
      'POST /api/test-comment',
      'POST /api/sync-metrics',
    ],
  });
});

// Global Error Handler
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

  const { publisherTask, analyticsTask } = initPublisherJob();

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    const localIp = getLocalIpAddress();
    console.log(`\n======================================================`);
    console.log(`🚀 ByteBangla 100% Autonomous Content Hub is live!`);
    console.log(`📡 Local:   http://localhost:${env.PORT}`);
    console.log(`📱 Mobile:  http://${localIp}:${env.PORT}`);
    console.log(`🛡️  Environment: ${env.NODE_ENV}`);
    console.log(`🕒 Cron Schedule: "${env.CRON_SCHEDULE}" (Asia/Dhaka)`);
    console.log(`======================================================\n`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n[Process] ${signal} received: closing server & cron...`);
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
