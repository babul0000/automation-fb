import express, { Request, Response, NextFunction } from 'express';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { env, validateEnv, isConfiguredForFacebook, isConfiguredForGemini } from './config/env';
import healthRouter from './routes/health';
import webhookRouter from './routes/webhook';
import {
  initPublisherJob,
  triggerManualPost,
  triggerAutonomousReelPost,
  rescheduleAllJobs,
  getSchedulerStatus,
  stopAllScheduledTasks,
} from './jobs/publisher';
import {
  getRecentPosts,
  getRecentComments,
  isDatabaseConnected,
  getJobLogs,
  saveComment,
  saveReply,
  getAutomationSettings,
  updateAutomationSettings,
  resetAutomationSettings,
  SlotConfig,
} from './services/db';
import { analyzeAudienceEngagement } from './services/learning';
import { collectAllRecentMetrics } from './services/analytics';
import { analyzeCommentWithAI } from './services/comments';

const app = express();

// Disable ETag and browser caching so dashboard settings always load live
app.set('etag', false);
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

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
 * Root Dashboard: 100% Autonomous 3-Post Content Operations Center
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
  const settings = getAutomationSettings();
  const scheduler = getSchedulerStatus();

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

  // Generate 4 Daily Slot Cards (3 Posts + 1 Reel)
  const slotCardsHtml = settings.slots
    .map((slot, index) => {
      const isReel = slot.type === 'REEL' || slot.id === 'slot_reel';
      const icon = isReel ? '🎬' : index === 0 ? '🌅' : index === 1 ? '☀️' : '🌙';
      const slotTimeId = `slot_time_${slot.id}`;
      const toggleId = `slot_toggle_${slot.id}`;
      const isEnabled = slot.enabled;
      const statusColor = slot.lastStatus === 'SUCCESS' ? 'text-emerald-400' : slot.lastStatus === 'FAILED' ? 'text-rose-400' : 'text-cyan-400';
      const statusText = slot.lastRun
        ? `সর্বশেষ: ${new Date(slot.lastRun).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })} (${slot.lastStatus || 'OK'})`
        : `শিডিউল: প্রতিদিন ${slot.time} BST`;

      const fbPostLink = slot.lastPostId
        ? `<a href="https://www.facebook.com/${env.PAGE_ID}/posts/${slot.lastPostId.includes('_') ? slot.lastPostId.split('_')[1] : slot.lastPostId}" target="_blank" class="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-sans"><span>পোস্ট দেখুন ➔</span></a>`
        : '';

      return `
      <div id="slot_card_${slot.id}" class="bg-slate-900/90 border ${isEnabled ? 'border-slate-800 hover:border-cyan-500/50' : 'border-slate-800/50 opacity-60'} rounded-3xl p-5 flex flex-col justify-between shadow-xl transition-all duration-200">
        <div>
          <!-- Header: Icon, Slot Title & Toggle Switch -->
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="flex items-center gap-2.5">
              <span class="w-10 h-10 rounded-2xl bg-slate-950 flex items-center justify-center text-xl border border-slate-800 shadow-inner">
                ${icon}
              </span>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-bold text-white">${slot.nameBn}</h3>
                  <span id="slot_badge_${slot.id}" class="text-[10px] px-2 py-0.5 rounded-full font-mono ${isReel ? 'bg-fuchsia-950/70 text-fuchsia-300 border border-fuchsia-800/60' : 'bg-cyan-950/70 text-cyan-300 border border-cyan-800/60'} font-bold">${isReel ? '🎬 REEL' : '📝 POST'} • ${slot.time} BST</span>
                </div>
                <p class="text-[11px] text-slate-400 font-sans mt-0.5">${slot.name}</p>
              </div>
            </div>
            
            <!-- Slot Active Switch -->
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="${toggleId}" ${isEnabled ? 'checked' : ''} onchange="toggleSlotActive('${slot.id}', this.checked)" class="sr-only peer">
              <div class="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <!-- Category Banner -->
          <div class="bg-slate-950/80 p-3 rounded-2xl border border-slate-800/90 mb-3">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">থিম ও কনটেন্ট ক্যাটাগরি:</span>
            <p class="text-xs font-semibold text-cyan-300 mt-0.5">${slot.categoryBn || slot.category}</p>
            <p class="text-[10px] text-slate-400 mt-0.5 line-clamp-1">${slot.category}</p>
          </div>

          <!-- Time Picker & Quick Inline Save -->
          <div class="flex items-center gap-2 mb-3 bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800">
            <label class="text-[11px] text-slate-300 font-semibold shrink-0">পোস্ট টাইম:</label>
            <input type="time" id="${slotTimeId}" value="${slot.time}" autocomplete="off" class="bg-slate-900 border border-slate-700 text-cyan-300 text-xs font-mono font-bold rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-cyan-500" />
            <button onclick="saveSlotTime('${slot.id}')" id="btn_save_${slot.id}" class="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-semibold transition active:scale-95 ml-auto">
              সেভ
            </button>
          </div>

          <!-- Execution Status -->
          <div class="flex items-center justify-between text-[11px] px-1 mb-4">
            <span class="flex items-center gap-1.5 ${statusColor} font-mono text-[10px]">
              <span class="w-2 h-2 rounded-full ${slot.lastStatus === 'SUCCESS' ? 'bg-emerald-400' : slot.lastStatus === 'FAILED' ? 'bg-rose-400' : 'bg-cyan-400'} animate-pulse"></span>
              <span>${statusText}</span>
            </span>
            ${fbPostLink}
          </div>
        </div>

        <!-- Action Buttons: Post Now & Simulate -->
        <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
          <button onclick="triggerSpecificSlot('${slot.id}')" id="btn-trigger-${slot.id}" class="py-2.5 px-2.5 ${isReel ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-400 hover:to-purple-500 text-white' : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950'} text-xs font-bold rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-1">
            <span id="spinner-trigger-${slot.id}" class="hidden animate-spin text-xs">🌀</span>
            <span>🚀 ${isReel ? 'রিল আপলোড' : 'এখনই পোস্ট'}</span>
          </button>
          <button onclick="simulateSlot('${slot.id}', '${slot.category}')" class="py-2.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition active:scale-95 flex items-center justify-center gap-1">
            <span>🧪 সিমুলেট</span>
          </button>
        </div>
      </div>
      `;
    })
    .join('');

  const html = `
  <!DOCTYPE html>
  <html lang="bn" class="dark">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#020617">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <title>ByteBangla - ৩টি পোস্ট ও ১টি রিল অটোমেশন হাব</title>
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
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: #020617; }
      ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #475569; }
    </style>
  </head>
  <body class="bg-slate-950 text-slate-100 min-h-screen pb-24 sm:pb-16 select-none sm:select-auto">
    <!-- Floating Toast Notification Center -->
    <div id="toastContainer" class="fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"></div>
    
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
              <span id="masterHeaderBadge" class="inline-flex items-center gap-1 px-2.5 py-0.5 ${settings.autoPilotEnabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-amber-500/10 text-amber-400 border border-amber-500/25'} text-[10px] font-bold rounded-full">
                <span class="w-1.5 h-1.5 rounded-full ${settings.autoPilotEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}"></span>
                <span>${settings.autoPilotEnabled ? '৩টি দৈনিক পোস্ট সক্রিয়' : 'পজ করা আছে'}</span>
              </span>
            </div>
            <p class="text-[11px] text-slate-400 -mt-0.5">১০০% স্বয়ংক্রিয় এআই ফেসবুক কন্টেন্ট হাব</p>
          </div>
        </div>

        <!-- Top Actions -->
        <div class="flex items-center gap-2">
          <!-- Live Dhaka Clock -->
          <div class="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono">
            <span>⏰</span>
            <span id="dhakaLiveClock">--:--:-- BST</span>
          </div>

          <!-- Master Auto-Pilot Fast Toggle -->
          <button onclick="toggleMasterAutoPilot(${!settings.autoPilotEnabled})" class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition active:scale-95 ${settings.autoPilotEnabled ? 'bg-emerald-500/10 hover:bg-rose-500/10 text-emerald-400 hover:text-rose-400 border-emerald-500/30 hover:border-rose-500/30' : 'bg-amber-500/10 hover:bg-emerald-500/10 text-amber-400 hover:text-emerald-400 border-amber-500/30 hover:border-emerald-500/30'}">
            <span>${settings.autoPilotEnabled ? '🟢 অটো-পাইলট ON' : '⏸️ অটো-পাইলট PAUSED'}</span>
          </button>

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
            <span>🏠</span><span>ওভারভিউ ও ৩টি স্লট</span>
          </button>
          <button onclick="switchTab('schedule')" id="desk-tab-schedule" class="tab-btn px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white border border-transparent transition flex items-center gap-2">
            <span>⏰</span><span>শিডিউল ও কন্ট্রোল সেটিংস</span>
          </button>
          <button onclick="switchTab('studio')" id="desk-tab-studio" class="tab-btn px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white border border-transparent transition flex items-center gap-2">
            <span>🧪</span><span>এআই স্টুডিও ও কাস্টম পোস্ট</span>
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
      
      <!-- ⚡ Autonomous Mode Notification Banner -->
      <section class="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-cyan-950/40 border border-emerald-800/40 rounded-2xl p-3.5 sm:p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg font-bold border border-emerald-500/30 shrink-0">
            ⚡
          </div>
          <div>
            <p class="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
              <span>১০০% স্বয়ংক্রিয় মোড সক্রিয় (জিরো-অ্যাপ্রুভাল)</span>
              <span class="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.2 rounded-full font-bold">৩টি দৈনিক স্লট</span>
            </p>
            <p class="text-[11px] sm:text-xs text-slate-300 mt-0.5 leading-relaxed">
              আপনার কোনো ম্যানুয়াল অনুমোদনের প্রয়োজন নেই। এআই নিজে থেকেই প্রতিদিন সকাল ০৯:৩০, দুপুর ০২:৩০ ও রাত ০৮:৩০ মিনিটে স্বয়ংক্রিয়ভাবে ফেসবুকে পোস্ট পাবলিশ করবে।
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button onclick="switchTab('schedule')" class="w-full sm:w-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold rounded-xl border border-slate-700 transition active:scale-95 flex items-center justify-center gap-1.5">
            <span>⚙️ সেটিংস পরিবর্তন করুন</span>
          </button>
        </div>
      </section>

      <!-- ========================================================================= -->
      <!-- TAB 1: OVERVIEW & 3 SLOTS (হোম - ৩টি দৈনিক স্লট ও এক নজরে সব কিছু) -->
      <!-- ========================================================================= -->
      <div id="tab-content-overview" class="tab-pane space-y-5">
        
        <!-- 4 Quick Metric Cards -->
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
              <span class="font-medium">দৈনিক পোস্ট স্লট</span>
              <span>⏰</span>
            </div>
            <p class="text-2xl font-bold text-amber-400 font-mono mt-1">৩টি পোস্ট</p>
            <p class="text-[10px] text-slate-400 mt-0.5">সকাল • দুপুর • রাত</p>
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

        <!-- 🌟 ৩টি দৈনিক স্লট কন্ট্রোল সেকশন (The 3 Daily Slots Dashboard) -->
        <section class="space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 class="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>🕒 প্রতিদিনের ৩টি পোস্টের লাইভ কন্ট্রোল হাব</span>
                <span class="text-xs px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-bold">১০০% অটোমেশন</span>
              </h2>
              <p class="text-xs text-slate-400 mt-0.5">যেকোনো স্লটের সময় পরিবর্তন, চালু/বন্ধ বা তাৎক্ষণিক পোস্ট করুন:</p>
            </div>
            <button onclick="switchTab('schedule')" class="text-xs text-cyan-400 hover:text-cyan-300 transition">
              বিস্তারিত সেটিংস ➔
            </button>
          </div>

          <!-- 3 Slot Interactive Cards Grid -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${slotCardsHtml}
          </div>
        </section>

        <!-- ⏰ Daily Autonomous Routine & Schedule Card -->
        <section class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          <div class="flex items-center gap-2">
            <span class="text-base sm:text-lg font-bold text-white">🕒 ২৪ ঘণ্টার স্বয়ংক্রিয় কাজের সময়সূচী</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <!-- Morning -->
            <div class="bg-slate-950/70 border border-amber-500/20 rounded-2xl p-3.5 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-lg">🌅</span>
                  <span id="timeline_badge_slot_1" class="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full font-mono font-bold text-[10px]">${settings.slots[0]?.time || '09:30'} AM</span>
                </div>
                <p class="font-bold text-slate-200">সকালের এআই টুলস</p>
                <p class="text-slate-400 text-[11px] mt-1 leading-relaxed">Product Hunt ও ট্রেন্ডিং নতুন এআই টুলসের সকালের ব্রিফিং।</p>
              </div>
            </div>

            <!-- Afternoon -->
            <div class="bg-slate-950/70 border border-cyan-500/20 rounded-2xl p-3.5 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-lg">☀️</span>
                  <span id="timeline_badge_slot_2" class="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-mono font-bold text-[10px]">${settings.slots[1]?.time || '14:30'} PM</span>
                </div>
                <p class="font-bold text-slate-200">দুপুরের চিটশিট</p>
                <p class="text-slate-400 text-[11px] mt-1 leading-relaxed">স্টেপ-বাই-স্টেপ গাইড, প্রম্পট ও ইনফোগ্রাফিক চিটশিট।</p>
              </div>
            </div>

            <!-- Evening -->
            <div class="bg-slate-950/70 border border-indigo-500/20 rounded-2xl p-3.5 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-lg">🌙</span>
                  <span id="timeline_badge_slot_3" class="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full font-mono font-bold text-[10px]">${settings.slots[2]?.time || '20:30'} PM</span>
                </div>
                <p class="font-bold text-slate-200">রাতের ভাইরাল টেক</p>
                <p class="text-slate-400 text-[11px] mt-1 leading-relaxed">টুল কম্প্যারিজন, ভাইরাল টেক আলোচনা ও রিলস স্ক্রিপ্ট।</p>
              </div>
            </div>

            <!-- Night Analytics -->
            <div class="bg-slate-950/70 border border-purple-500/20 rounded-2xl p-3.5 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-lg">📊</span>
                  <span class="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded-full font-mono font-bold text-[10px]">12:00 AM</span>
                </div>
                <p class="font-bold text-slate-200">অ্যানালিটিক্স ব্রেন</p>
                <p class="text-slate-400 text-[11px] mt-1 leading-relaxed">রিঅ্যাকশন, কমেন্ট বিশ্লেষণ করে আগামীকালের স্ট্র্যাটেজি আপডেট।</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 🤖 Bot Fleet Showcase -->
        <section class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-base sm:text-lg font-bold text-white">🤖 ৮টি স্বয়ংক্রিয় এআই বট ও তাদের ভূমিকা</span>
              </div>
              <p class="text-xs text-slate-400 mt-0.5">আপনার পেজে ২৪ ঘণ্টা ব্যাকগ্রাউন্ডে সক্রিয় থাকা বটের ভূমিকা:</p>
            </div>
            <span class="hidden sm:inline-flex px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-full">
              ৮/৮ ফুল একটিভ
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5">
              <span class="text-base mb-1 block">1️⃣ 🚀</span>
              <p class="font-bold text-slate-200">ট্রেন্ড ট্র্যাকার বট</p>
              <p class="text-slate-400 text-[11px] mt-1">Product Hunt, Reddit ও Hugging Face থেকে বিশ্বসেরা এআই টুলস ট্র্যাক করে।</p>
            </div>
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5">
              <span class="text-base mb-1 block">2️⃣ 🌐</span>
              <p class="font-bold text-slate-200">ফ্যাক্ট-চেকার বট</p>
              <p class="text-slate-400 text-[11px] mt-1">গুগল লাইভ সার্চ দিয়ে টুলস ও তথ্যের সত্যতা ১০০% যাচাই করে।</p>
            </div>
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5">
              <span class="text-base mb-1 block">3️⃣ 🎬</span>
              <p class="font-bold text-slate-200">কন্টেন্ট ও রিলস স্ক্রিপ্টার</p>
              <p class="text-slate-400 text-[11px] mt-1">আকর্ষণীয় বাংলা ক্যাপশন ও ৩০ সেকেন্ডের রিলস স্ক্রিপ্ট তৈরি করে।</p>
            </div>
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5">
              <span class="text-base mb-1 block">4️⃣ 🧐</span>
              <p class="font-bold text-slate-200">ক্রিটিক অডিটর</p>
              <p class="text-slate-400 text-[11px] mt-1">৮৫-এর কম স্কোর পেলে ড্রাফট নিজেই পরিমার্জন ও রিরাইট করে।</p>
            </div>
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5">
              <span class="text-base mb-1 block">5️⃣ 🎨</span>
              <p class="font-bold text-slate-200">চিটশিট ও ইমেজ বট</p>
              <p class="text-slate-400 text-[11px] mt-1">১:১ স্কয়ার রেশিওতে ওয়াটারমার্কযুক্ত ৩ডি ইনফোগ্রাফিক স্লাইড তৈরি করে।</p>
            </div>
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5">
              <span class="text-base mb-1 block">6️⃣ 🚀</span>
              <p class="font-bold text-slate-200">গ্রাফ এপিআই পাবলিশার</p>
              <p class="text-slate-400 text-[11px] mt-1">মেটা গ্রাফ এপিআই দিয়ে পোস্ট করে ১ম কমেন্টে লিংক পিন করে দেয়।</p>
            </div>
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5">
              <span class="text-base mb-1 block">7️⃣ 💬</span>
              <p class="font-bold text-slate-200">কমেন্ট ও ডিএম বট</p>
              <p class="text-slate-400 text-[11px] mt-1">কমেন্টের উত্তর দেয় এবং ইনবক্সে ডিরেক্ট রিসোর্স টুল লিংক পাঠিয়ে দেয়।</p>
            </div>
            <div class="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5">
              <span class="text-base mb-1 block">8️⃣ 📈</span>
              <p class="font-bold text-slate-200">অ্যানালিটিক্স ব্রেন</p>
              <p class="text-slate-400 text-[11px] mt-1">অডিয়েন্সের রিঅ্যাকশন ও এনগেজমেন্টের ওপর ভিত্তি করে সেলফ-লার্ন করে।</p>
            </div>
          </div>
        </section>

      </div>

      <!-- ========================================================================= -->
      <!-- TAB 2: SCHEDULE & CONTROL SETTINGS (শিডিউল ও সেটিংস কন্ট্রোল প্যানেল) -->
      <!-- ========================================================================= -->
      <div id="tab-content-schedule" class="tab-pane hidden space-y-5">
        <section class="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl space-y-6">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">
                ⚙️ সম্পূর্ণ অটোমেশন কন্ট্রোল
              </span>
              <h2 class="text-lg sm:text-xl font-bold text-white mt-2">৩টি দৈনিক পোস্টের সময়সূচী ও ফিচার সেটিংস</h2>
              <p class="text-xs sm:text-sm text-slate-400 mt-1">
                আপনার পেজের জন্য প্রয়োজনীয় প্রতিটি ফিচার ও সময়সূচী সরাসরি এই প্যানেল থেকে কনফিগার করুন।
              </p>
            </div>
            <button onclick="resetSettingsToDefault()" class="text-xs text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/40 px-3 py-1.5 rounded-xl transition">
              ডিফল্ট সেটিংসে রিসেট
            </button>
          </div>

          <!-- Master Auto-Pilot Box -->
          <div class="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p class="text-sm font-bold text-white flex items-center gap-2">
                <span>🤖 মাস্টার অটো-পাইলট (Master Auto-Pilot)</span>
                <span id="masterStatusBadge" class="text-xs px-2 py-0.5 rounded-full font-bold ${settings.autoPilotEnabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}">
                  ${settings.autoPilotEnabled ? 'সক্রিয় (Active)' : 'পজ করা (Paused)'}
                </span>
              </p>
              <p class="text-xs text-slate-400 mt-1">
                চালু থাকলে প্রতিদিন নির্ধারিত সময়ে স্বয়ংক্রিয়ভাবে ৩টি পোস্ট ফেসবুকে লাইভ হবে। বন্ধ রাখলে শিডিউল স্থগিত থাকবে।
              </p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" id="masterAutoPilotToggle" ${settings.autoPilotEnabled ? 'checked' : ''} onchange="toggleMasterAutoPilot(this.checked)" class="sr-only peer">
              <div class="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <!-- Feature Toggles Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <!-- Auto First Comment -->
            <div class="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-bold text-slate-200">🔗 ফার্স্ট কমেন্ট অটোমেশন</p>
                <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">পোস্ট পাবলিশের ৩ সেকেন্ড পর ১ম কমেন্টে অফিশিয়াল লিংক পিন করে (রিচ বাড়ানোর জন্য)।</p>
              </div>
              <input type="checkbox" id="toggleFirstComment" ${settings.autoFirstComment ? 'checked' : ''} class="w-5 h-5 accent-cyan-500 rounded cursor-pointer mt-1" />
            </div>

            <!-- Auto Comment Reply -->
            <div class="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-bold text-slate-200">💬 এআই অটো কমেন্ট রিপ্লাই</p>
                <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">ইউজারদের কমেন্টের ভাব বুঝে এআই প্রাসঙ্গিক ও তথ্যবহুল বাংলা উত্তর পাঠাবে।</p>
              </div>
              <input type="checkbox" id="toggleCommentReply" ${settings.autoCommentReply ? 'checked' : ''} class="w-5 h-5 accent-cyan-500 rounded cursor-pointer mt-1" />
            </div>

            <!-- Auto DM Resource -->
            <div class="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-bold text-slate-200">📩 ইনবক্স ডিএম ডেলিভারি</p>
                <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">কেউ 'টুল' বা 'লিংক' চাইলে স্বয়ংক্রিয়ভাবে মেসেঞ্জারে ডিরেক্ট রিসোর্স পাঠাবে।</p>
              </div>
              <input type="checkbox" id="toggleAutoDm" ${settings.autoDm ? 'checked' : ''} class="w-5 h-5 accent-cyan-500 rounded cursor-pointer mt-1" />
            </div>
          </div>

          <!-- 3 Slots Detailed Time & Theme Editor -->
          <div class="space-y-4 pt-2">
            <h3 class="text-sm font-bold text-slate-200 flex items-center gap-2">
              <span>⏰ ৩টি পোস্টের স্লট টাইম ও থিম সম্পাদনা:</span>
            </h3>

            ${settings.slots
              .map((s, idx) => {
                const icon = idx === 0 ? '🌅' : idx === 1 ? '☀️' : '🌙';
                return `
                <div class="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div class="flex items-center justify-between flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                      <span class="text-lg">${icon}</span>
                      <span class="text-xs font-bold text-white">${s.nameBn} (${s.name})</span>
                    </div>
                    <label class="inline-flex items-center gap-2 text-xs text-slate-300">
                      <input type="checkbox" id="form_slot_enabled_${s.id}" ${s.enabled ? 'checked' : ''} class="w-4 h-4 accent-cyan-500 rounded cursor-pointer">
                      <span>এই স্লট চালু রাখুন</span>
                    </label>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label class="text-[11px] text-slate-400 block mb-1">পোস্টিং সময় (BST):</label>
                      <input type="time" id="form_slot_time_${s.id}" value="${s.time}" autocomplete="off" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500" />
                    </div>
                    <div class="sm:col-span-2">
                      <label class="text-[11px] text-slate-400 block mb-1">কনটেন্ট ক্যাটাগরি ও থিম ফোকাস:</label>
                      <input type="text" id="form_slot_category_${s.id}" value="${s.category}" autocomplete="off" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-sans" />
                    </div>
                  </div>
                </div>
                `;
              })
              .join('')}
          </div>

          <!-- Save All Settings Button -->
          <div class="pt-3 border-t border-slate-800 flex justify-end">
            <button onclick="saveAllSettingsForm()" id="saveAllSettingsBtn" class="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2">
              <span id="saveSettingsSpinner" class="hidden animate-spin">🌀</span>
              <span>💾 সকল সেটিংস সেভ ও কার্যকর করুন</span>
            </button>
          </div>
        </section>
      </div>

      <!-- ========================================================================= -->
      <!-- TAB 3: AI STUDIO & SIMULATOR (এআই স্টুডিও ও কাস্টম পোস্ট) -->
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

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <button id="previewBtn" onclick="runPipeline(true)" class="w-full py-3.5 px-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-lg shadow-purple-600/25 transition duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]">
              <span id="previewSpinner" class="hidden animate-spin">🌀</span>
              <span id="previewText">🧪 টেস্ট পোস্ট ক্যারোসেল</span>
            </button>

            <button id="previewReelBtn" onclick="runReelPipeline(true)" class="w-full py-3.5 px-4 bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-lg shadow-pink-600/25 transition duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]">
              <span id="previewReelSpinner" class="hidden animate-spin">🌀</span>
              <span id="previewReelText">🎬 টেস্ট রিল ও অডিও শুনুন</span>
            </button>

            <button id="liveBtn" onclick="openLiveConfirmModal()" class="w-full py-3.5 px-4 bg-slate-800/90 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 font-bold text-xs sm:text-sm rounded-2xl border border-slate-700 transition duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]">
              <span>🚀 ফেসবুকে লাইভ পোস্ট</span>
            </button>
          </div>

          <!-- Live Progress Feedback -->
          <div id="liveFeedback" class="hidden mt-4 pt-4 border-t border-slate-800 text-xs sm:text-sm">
            <div class="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
              <div class="flex items-center gap-2 text-cyan-400 font-semibold">
                <span class="animate-spin text-base">⚙️</span>
                <span id="feedbackText">এআই পাইপলাইন কাজ করছে...</span>
              </div>
              <p class="text-[11px] text-slate-400">ট্রেন্ড রিসার্চ ➔ ফ্যাক্ট চেক ➔ হিউম্যান নিউরাল ভয়েসওভার ➔ ৩ডি ভিজ্যুয়াল (অনুগ্রহ করে ১৫-২৫ সেকেন্ড অপেক্ষা করুন)</p>
            </div>
          </div>

          <!-- Reel Video & Audio Player Card -->
          <div id="reelPlayerCard" class="hidden mt-4 pt-4 border-t border-slate-800 space-y-4">
            <div class="bg-gradient-to-br from-purple-950/80 via-slate-900 to-indigo-950/70 border border-purple-600/40 rounded-3xl p-5 shadow-2xl space-y-4">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-2xl">🎬</span>
                  <div>
                    <h3 class="text-base font-bold text-white flex items-center gap-2">
                      <span>১০০/১০০ হিউম্যান ভয়েস রিল প্রিভিউ</span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30">Microsoft Neural Voice</span>
                    </h3>
                    <p class="text-xs text-slate-400">ন্যাচারাল ক্রিয়েটর ভয়েসওভার ও ৯:১৬ এইচডি ভিডিও</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button onclick="publishLatestReelNow()" id="publishReelDirectBtn" class="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-lg transition active:scale-95 flex items-center gap-1.5">
                    <span id="publishReelDirectSpinner" class="hidden animate-spin">🌀</span>
                    <span>🚀 এই রিলটি ফেসবুকে পোস্ট করুন</span>
                  </button>
                  <button onclick="document.getElementById('reelPlayerCard').classList.add('hidden')" class="text-xs text-slate-400 hover:text-white p-1">✕</button>
                </div>
              </div>

              <!-- Video & Audio Player Center -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
                <!-- 9:16 Video Player -->
                <div class="flex flex-col items-center">
                  <div class="w-full max-w-[240px] aspect-[9/16] bg-black rounded-2xl overflow-hidden shadow-2xl border border-purple-500/30">
                    <video id="previewVideoElement" controls playsinline class="w-full h-full object-cover"></video>
                  </div>
                  <span class="text-[11px] text-slate-400 mt-2">📱 ৯:১৬ এইচডি ফেসবুক রিল ফরম্যাট (1080x1920)</span>
                </div>

                <!-- Voiceover & Script breakdown -->
                <div class="space-y-3">
                  <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                    <span class="text-xs font-bold text-pink-400 flex items-center gap-1.5">
                      <span>🎙️</span><span>হিউম্যান ভয়েসওভার অডিও (সরাসরি শুনুন):</span>
                    </span>
                    <audio id="previewAudioElement" controls class="w-full h-10 rounded-lg"></audio>
                  </div>

                  <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-1.5">
                    <span class="text-xs font-bold text-purple-400">📜 ডায়লগ ও স্ক্রিপ্ট:</span>
                    <p id="reelPlayerScript" class="text-xs text-slate-200 leading-relaxed font-sans"></p>
                  </div>

                  <div class="bg-emerald-950/30 border border-emerald-800/40 rounded-2xl p-3 text-xs text-emerald-300 flex items-center gap-2">
                    <span>✨</span>
                    <span>কোনো রোবটিক ড্রোন বা বুলেট নম্বর নেই। একদম ন্যাচারাল সাবলীল কথ্য ভাষা!</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Preview Result Card -->
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

            <!-- Carousel Preview -->
            <div>
              <p class="text-xs font-bold text-slate-300 mb-2">📸 তৈরি হওয়া ৩ডি ভিজ্যুয়াল স্লাইডসমূহ:</p>
              <div id="carouselPreviewGrid" class="grid grid-cols-1 sm:grid-cols-3 gap-3"></div>
            </div>

            <!-- Caption -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-cyan-400">📝 মূল বাংলা ক্যাপশন:</span>
                <button onclick="copyToClipboard(document.getElementById('previewCaption').innerText, 'ক্যাপশন কপি করা হয়েছে!')" class="text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-950/70 border border-cyan-800/60 px-2.5 py-1 rounded-lg">
                  কপি করুন
                </button>
              </div>
              <pre id="previewCaption" class="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed"></pre>
            </div>

            <!-- First Comment -->
            <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold text-amber-400">🔗 ১ম কমেন্ট (অফিসিয়াল রিসোর্স লিংক):</span>
                <button onclick="copyToClipboard(document.getElementById('previewFirstComment').innerText, 'ফার্স্ট কমেন্ট কপি করা হয়েছে!')" class="text-xs text-amber-400 hover:text-amber-300 bg-amber-950/70 border border-amber-800/60 px-2.5 py-1 rounded-lg">
                  কপি করুন
                </button>
              </div>
              <pre id="previewFirstComment" class="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed"></pre>
            </div>

            <!-- Reels Script -->
            <div id="reelsCard" class="hidden bg-gradient-to-br from-indigo-950/70 via-slate-900 to-purple-950/50 p-4 rounded-2xl border border-indigo-700/50 space-y-3">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-lg">🎬</span>
                  <span class="text-xs font-bold text-purple-300">ফেসবুক রিলস স্ক্রিপ্ট (৩০-৪৫ সেকেন্ড)</span>
                </div>
                <button onclick="copyToClipboard(document.getElementById('reelsFullScript').innerText, 'রিলস স্ক্রিপ্ট কপি করা হয়েছে!')" class="text-xs text-purple-300 hover:text-white bg-purple-900/60 border border-purple-700/70 px-3 py-1 rounded-lg transition active:scale-95">
                  📋 কপি
                </button>
              </div>
              <div class="space-y-2 text-xs">
                <div class="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <span class="text-purple-400 font-bold">⚡ ভাইরাল হুক ডায়লগ (০-৫ সেকেন্ড):</span>
                  <p id="reelsHook" class="text-slate-100 font-medium mt-1"></p>
                </div>
                <div class="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <span class="text-cyan-400 font-bold">💡 মূল ভয়েসওভার বডি (৫-২৫ সেকেন্ড):</span>
                  <p id="reelsBody" class="text-slate-200 mt-1 whitespace-pre-wrap"></p>
                </div>
                <div class="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <span class="text-amber-400 font-bold">🚀 কল টু অ্যাকশন (২৫-৩০ সেকেন্ড):</span>
                  <p id="reelsCta" class="text-slate-100 font-medium mt-1"></p>
                </div>
                <div id="reelsFullScript" class="hidden"></div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- ========================================================================= -->
      <!-- TAB 4: POSTS & METRICS (পোস্টসমূহ ও পারফরম্যান্স) -->
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
      <!-- TAB 5: COMMUNITY & COMMENTS (কমেন্ট ও ইনবক্স ডিএম) -->
      <!-- ========================================================================= -->
      <div id="tab-content-community" class="tab-pane hidden space-y-5">
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
      <!-- TAB 6: AI BRAIN & SYSTEM HEALTH (এআই ব্রেন ও হেলথ) -->
      <!-- ========================================================================= -->
      <div id="tab-content-brain" class="tab-pane hidden space-y-5">
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

            <!-- 3-Slot Multi Scheduler -->
            <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <p class="font-bold text-slate-200">৩টি দৈনিক স্লট ক্রন শিডিউলার</p>
                <p class="text-[11px] text-slate-400 font-mono mt-0.5">${scheduler.activeSlotsCount}/3 Active Slots</p>
              </div>
              <span class="px-2.5 py-1 ${scheduler.autoPilotEnabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'} rounded-full font-bold text-[11px]">
                ● ${scheduler.autoPilotEnabled ? 'Running' : 'Paused'}
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

            <!-- First Comment Hack -->
            <div class="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <p class="font-bold text-slate-200">ফার্স্ট কমেন্ট অটোমেশন</p>
                <p class="text-[11px] text-slate-400 font-mono mt-0.5">${settings.autoFirstComment ? 'Enabled' : 'Disabled'}</p>
              </div>
              <span class="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold text-[11px]">
                ● Active
              </span>
            </div>
          </div>
        </section>

        <!-- Audit Log -->
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

    <!-- 📱 MOBILE STICKY BOTTOM NAVIGATION BAR -->
    <nav class="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-2 py-2 flex items-center justify-around sm:hidden">
      <button onclick="switchTab('overview')" id="mob-tab-overview" class="mobile-tab-btn mobile-tab-active flex flex-col items-center gap-1 text-slate-400 active:scale-95 transition">
        <svg class="w-5 h-5 stroke-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
        <span class="text-[10px] font-semibold">হোম</span>
      </button>

      <button onclick="switchTab('schedule')" id="mob-tab-schedule" class="mobile-tab-btn flex flex-col items-center gap-1 text-slate-400 active:scale-95 transition">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span class="text-[10px] font-semibold">শিডিউল</span>
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
      function showToast(message, type) {
        var t = type || 'success';
        var container = document.getElementById('toastContainer');
        if (!container) return;
        var toast = document.createElement('div');
        var bg = t === 'success' 
          ? 'bg-slate-900/95 border-emerald-500/60 text-emerald-300' 
          : 'bg-slate-900/95 border-rose-500/60 text-rose-300';
        toast.className = 'p-4 rounded-2xl border shadow-2xl backdrop-blur-md text-xs font-semibold flex items-center justify-between gap-3 pointer-events-auto transition-all duration-300 transform translate-y-[-10px] opacity-0 ' + bg;
        var icon = t === 'success' ? '✅' : '❌';
        toast.innerHTML = '<div class="flex items-center gap-2"><span>' + icon + '</span><span>' + message + '</span></div><button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white ml-2 text-sm">✕</button>';
        container.appendChild(toast);
        setTimeout(function() {
          toast.classList.remove('translate-y-[-10px]', 'opacity-0');
          toast.classList.add('translate-y-0', 'opacity-100');
        }, 10);
        setTimeout(function() {
          toast.classList.add('opacity-0', 'translate-y-[-10px]');
          setTimeout(function() { toast.remove(); }, 300);
        }, 4000);
      }

      function copyToClipboard(text, msg) {
        if (!text) return;
        navigator.clipboard.writeText(text);
        showToast(msg || 'ক্লিপবোর্ডে কপি করা হয়েছে!', 'success');
      }

      function updateClock() {
        const now = new Date();
        const str = now.toLocaleTimeString('bn-BD', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' BST';
        const el = document.getElementById('dhakaLiveClock');
        if (el) el.innerText = str;
      }
      setInterval(updateClock, 1000);
      updateClock();

      function switchTab(tabId) {
        sessionStorage.setItem('activeTab', tabId);

        document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
        
        const target = document.getElementById('tab-content-' + tabId);
        if (target) target.classList.remove('hidden');

        document.querySelectorAll('.tab-btn').forEach(btn => {
          btn.classList.remove('tab-active');
          btn.classList.add('text-slate-400');
        });
        const activeDeskTab = document.getElementById('desk-tab-' + tabId);
        if (activeDeskTab) {
          activeDeskTab.classList.add('tab-active');
          activeDeskTab.classList.remove('text-slate-400');
        }

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

      // Auto-restore active tab on load
      window.addEventListener('DOMContentLoaded', () => {
        const savedTab = sessionStorage.getItem('activeTab');
        if (savedTab && document.getElementById('tab-content-' + savedTab)) {
          switchTab(savedTab);
        }
      });

      // Master Auto-Pilot Switch
      async function toggleMasterAutoPilot(enabled) {
        try {
          const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autoPilotEnabled: enabled }),
          });
          const json = await res.json();
          if (json.success) {
            showToast(enabled ? '✅ মাস্টার অটো-পাইলট চালু করা হয়েছে! প্রতিদিন ৩টি পোস্ট স্বয়ংক্রিয়ভাবে হবে।' : '⏸️ মাস্টার অটো-পাইলট সাময়িক পজ করা হয়েছে।', 'success');
            setTimeout(() => window.location.reload(), 800);
          } else {
            showToast('এরর: ' + (json.error || 'Failed to update'), 'error');
          }
        } catch (e) {
          showToast('নেটওয়ার্ক এরর: ' + e.message, 'error');
        }
      }

      // Toggle Individual Slot Switch
      async function toggleSlotActive(slotId, enabled) {
        try {
          const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slots: [{ id: slotId, enabled: enabled }]
            }),
          });
          const json = await res.json();
          if (json.success) {
            showToast(enabled ? '✅ স্লট চালু করা হয়েছে!' : '⚪ স্লট সাময়িক বন্ধ করা হয়েছে!', 'success');
            const card = document.getElementById('slot_card_' + slotId);
            if (card) {
              if (enabled) {
                card.classList.remove('opacity-60', 'border-slate-800/50');
                card.classList.add('border-slate-800', 'hover:border-cyan-500/50');
              } else {
                card.classList.add('opacity-60', 'border-slate-800/50');
                card.classList.remove('border-slate-800', 'hover:border-cyan-500/50');
              }
            }
            const formToggle = document.getElementById('form_slot_enabled_' + slotId);
            if (formToggle) formToggle.checked = enabled;
          } else {
            showToast('এরর: ' + (json.error || 'Failed'), 'error');
          }
        } catch (e) {
          showToast('নেটওয়ার্ক এরর: ' + e.message, 'error');
        }
      }

      // Save Individual Slot Time (Direct Inline Live Update)
      async function saveSlotTime(slotId) {
        const input = document.getElementById('slot_time_' + slotId);
        if (!input || !input.value) return;

        const toggleEl = document.getElementById('slot_toggle_' + slotId);
        const isEnabled = toggleEl ? toggleEl.checked : true;

        const btn = document.getElementById('btn_save_' + slotId);
        const originalText = btn ? btn.innerText : 'সেভ';
        if (btn) btn.innerText = 'সেভ হচ্ছে...';

        try {
          const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slots: [{ id: slotId, time: input.value, enabled: isEnabled }]
            }),
          });
          const json = await res.json();
          if (json.success) {
            showToast('✅ স্লটের সময় ' + input.value + ' BST সফলভাবে সেভ করা হয়েছে!', 'success');
            
            // 1. Update Card Badge
            const badge = document.getElementById('slot_badge_' + slotId);
            if (badge) badge.innerText = input.value + ' BST';

            // 2. Update 24h Timeline Badge
            const timelineBadge = document.getElementById('timeline_badge_' + slotId);
            if (timelineBadge) {
              const h = parseInt(input.value.split(':')[0], 10) || 0;
              timelineBadge.innerText = input.value + (h >= 12 ? ' PM' : ' AM');
            }

            // 3. Sync input in Schedule tab
            const formInput = document.getElementById('form_slot_time_' + slotId);
            if (formInput) formInput.value = input.value;

            // 4. Button feedback
            if (btn) {
              btn.innerText = '✅ সেভড!';
              btn.className = 'px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-semibold transition active:scale-95 ml-auto';
              setTimeout(() => {
                btn.innerText = 'সেভ';
                btn.className = 'px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-semibold transition active:scale-95 ml-auto';
              }, 2000);
            }
          } else {
            showToast('এরর: ' + (json.error || 'Failed'), 'error');
            if (btn) btn.innerText = originalText;
          }
        } catch (e) {
          showToast('নেটওয়ার্ক এরর: ' + e.message, 'error');
          if (btn) btn.innerText = originalText;
        }
      }

      // Save All Settings Form (Schedule Tab)
      async function saveAllSettingsForm() {
        const btn = document.getElementById('saveAllSettingsBtn');
        const spinner = document.getElementById('saveSettingsSpinner');
        btn.disabled = true;
        spinner.classList.remove('hidden');

        try {
          const autoPilotEnabled = document.getElementById('masterAutoPilotToggle')?.checked ?? true;
          const autoFirstComment = document.getElementById('toggleFirstComment')?.checked ?? true;
          const autoCommentReply = document.getElementById('toggleCommentReply')?.checked ?? true;
          const autoDm = document.getElementById('toggleAutoDm')?.checked ?? true;

          const slots = ['slot_1', 'slot_2', 'slot_3'].map(id => {
            const timeEl = document.getElementById('form_slot_time_' + id);
            const catEl = document.getElementById('form_slot_category_' + id);
            const enabledEl = document.getElementById('form_slot_enabled_' + id);
            return {
              id: id,
              time: timeEl ? timeEl.value : '09:30',
              category: catEl ? catEl.value : '',
              enabled: enabledEl ? enabledEl.checked : true,
            };
          });

          const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              autoPilotEnabled,
              autoFirstComment,
              autoCommentReply,
              autoDm,
              slots,
            }),
          });
          const json = await res.json();
          if (json.success) {
            sessionStorage.setItem('activeTab', 'schedule');
            showToast('✅ সকল সেটিংস ও ৩টি দৈনিক শিডিউল সফলভাবে আপডেট করা হয়েছে!', 'success');
            setTimeout(() => window.location.reload(), 1000);
          } else {
            showToast('এরর: ' + (json.error || 'Failed to update'), 'error');
          }
        } catch (e) {
          showToast('নেটওয়ার্ক এরর: ' + e.message, 'error');
        } finally {
          btn.disabled = false;
          spinner.classList.add('hidden');
        }
      }

      // Reset Settings to Defaults
      async function resetSettingsToDefault() {
        if (!confirm('আপনি কি ডিফল্ট সেটিংসে ফিরে যেতে চান?')) return;
        try {
          const res = await fetch('/api/reset-settings', { method: 'POST' });
          const json = await res.json();
          if (json.success) {
            showToast('✅ ডিফল্ট ৩-স্লট সেটিংস সফলভাবে রিস্টোর করা হয়েছে!', 'success');
            setTimeout(() => window.location.reload(), 1000);
          }
        } catch (e) {
          showToast('এরর: ' + e.message, 'error');
        }
      }

      // Trigger Specific Slot Live
      async function triggerSpecificSlot(slotId) {
        if (!confirm('আপনি কি এই স্লটের পোস্ট এখনই ফেসবুকে সরাসরি পাবলিশ করতে চান?')) return;

        const btn = document.getElementById('btn-trigger-' + slotId);
        const spinner = document.getElementById('spinner-trigger-' + slotId);
        btn.disabled = true;
        spinner.classList.remove('hidden');

        try {
          const res = await fetch('/api/trigger-slot/' + slotId, {
            method: 'POST',
          });
          const text = await res.text();
          let json;
          try {
            json = JSON.parse(text);
          } catch (parseErr) {
            if (res.status === 502 || res.status === 503 || res.status === 504) {
              alert('⏳ রেন্ডার ক্লাউড সার্ভার আপডেট বা রিস্টার্ট হচ্ছে। অনুগ্রহ করে ৩০ সেকেন্ড পর আবার চেষ্টা করুন।');
              return;
            }
            alert('সার্ভার রেসপন্স এরর (' + res.status + '): অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।');
            return;
          }
          if (json.success) {
            alert('🌟 পোস্ট সফলভাবে ফেসবুকে লাইভ পাবলিশ করা হয়েছে! পোস্ট আইডি: ' + json.data.postId);
            window.location.reload();
          } else {
            alert('❌ পোস্ট তৈরিতে সমস্যা হয়েছে: ' + (json.data?.error || json.error || 'Failed'));
          }
        } catch (e) {
          alert('নেটওয়ার্ক এরর: ' + e.message);
        } finally {
          btn.disabled = false;
          spinner.classList.add('hidden');
        }
      }

      // Simulate a Slot in Studio
      function simulateSlot(slotId, category) {
        switchTab('studio');
        const input = document.getElementById('customTopicInput');
        if (input) input.value = category || '';
        if (slotId === 'slot_reel') {
          runReelPipeline(true);
        } else {
          runPipeline(true);
        }
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

              if (json.data.reelsScript) {
                document.getElementById('reelsHook').innerText = json.data.reelsScript.hook || '';
                document.getElementById('reelsBody').innerText = json.data.reelsScript.body || '';
                const fullReels = json.data.reelsScript.fullScript || [json.data.reelsScript.hook, json.data.reelsScript.body, json.data.reelsScript.cta].filter(Boolean).join(String.fromCharCode(10) + String.fromCharCode(10));
                document.getElementById('reelsFullScript').innerText = fullReels;
                document.getElementById('reelsCard').classList.remove('hidden');
              } else {
                document.getElementById('reelsCard').classList.add('hidden');
              }

              const grid = document.getElementById('carouselPreviewGrid');
              grid.innerHTML = (json.data.imageUrls || []).map((url, i) =>
                '<div><p class="text-[11px] text-slate-400 mb-1 font-semibold">স্লাইড ' + (i+1) + (i === 0 ? ' (কভার)' : (i === 1 ? ' (চিটশিট)' : ' (অ্যাকশন)')) + '</p><img src="' + url + '" class="w-full h-44 object-cover rounded-xl border border-slate-700 shadow-md" /></div>'
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

      async function runReelPipeline(dryRun) {
        const btn = document.getElementById('previewReelBtn');
        const spinner = document.getElementById('previewReelSpinner');
        const customInput = document.getElementById('customTopicInput');
        const feedback = document.getElementById('liveFeedback');
        const feedbackText = document.getElementById('feedbackText');
        const reelPlayerCard = document.getElementById('reelPlayerCard');

        const topic = customInput ? customInput.value.trim() : '';

        if (btn) btn.disabled = true;
        if (spinner) spinner.classList.remove('hidden');
        feedback.classList.remove('hidden');
        feedbackText.className = 'text-pink-400 font-semibold';
        feedbackText.innerText = dryRun
          ? '🎬 এআই রিল স্ক্রিপ্ট, মাইক্রোসফট নিউরাল হিউম্যান ভয়েসওভার ও ৯:১৬ ভার্টিক্যাল এইচডি ভিডিও তৈরি করছে (১৫-২৫ সেকেন্ড অপেক্ষা করুন)...'
          : '🚀 রিল ভিডিও তৈরি হচ্ছে এবং ফেসবুকে লাইভ আপলোড হচ্ছে...';

        try {
          const res = await fetch('/api/trigger-reel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, dryRun }),
          });
          const json = await res.json();

          if (json.success) {
            feedbackText.innerText = dryRun
              ? '✅ ১০০/১০০ পারফেক্ট রিল সফলভাবে প্রস্তুত হয়েছে! নিচে লাইভ প্লে করুন এবং শুনুন।'
              : '🚀 রিল সফলভাবে ফেসবুকে লাইভ পাবলিশ করা হয়েছে!';
            feedbackText.className = 'text-emerald-400 font-bold';

            if (reelPlayerCard) {
              reelPlayerCard.classList.remove('hidden');
              const v = document.getElementById('previewVideoElement');
              const a = document.getElementById('previewAudioElement');
              const ts = Date.now();
              if (v) { v.src = '/api/reels/latest-video?t=' + ts; v.load(); }
              if (a) { a.src = '/api/reels/latest-audio?t=' + ts; a.load(); }
              
              if (json.data && json.data.reelScript) {
                const s = json.data.reelScript;
                document.getElementById('reelPlayerScript').innerText = 
                  s.fullScript || ([s.hook, s.body, s.cta].filter(Boolean).join(' '));
              }
              reelPlayerCard.scrollIntoView({ behavior: 'smooth' });
            }
          } else {
            feedbackText.innerText = '❌ রিল তৈরিতে ব্যর্থ: ' + (json.error || 'Unknown error');
            feedbackText.className = 'text-rose-400 font-bold';
          }
        } catch (err) {
          feedbackText.innerText = '❌ নেটওয়ার্ক এরর: ' + err.message;
          feedbackText.className = 'text-rose-400 font-bold';
        } finally {
          if (btn) btn.disabled = false;
          if (spinner) spinner.classList.add('hidden');
        }
      }

      async function publishLatestReelNow() {
        const btn = document.getElementById('publishReelDirectBtn');
        const spinner = document.getElementById('publishReelDirectSpinner');
        const feedback = document.getElementById('liveFeedback');
        const feedbackText = document.getElementById('feedbackText');
        const customInput = document.getElementById('customTopicInput');
        const topic = customInput ? customInput.value.trim() : '';

        if (!confirm('আপনি কি নিশ্চিত যে এই রিলটি আপনার ফেসবুক পেজে এখনই লাইভ পাবলিশ করবেন?')) {
          return;
        }

        if (btn) btn.disabled = true;
        if (spinner) spinner.classList.remove('hidden');
        feedback.classList.remove('hidden');
        feedbackText.className = 'text-purple-400 font-semibold';
        feedbackText.innerText = '🚀 রিল ফেসবুকে আপলোড হচ্ছে (ভিডিও ফাইল মেটা সার্ভারে প্রসেসিং হচ্ছে)...';

        try {
          const res = await fetch('/api/trigger-reel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, dryRun: false }),
          });
          const json = await res.json();
          if (json.success) {
            feedbackText.innerText = '🌟 রিল সফলভাবে ফেসবুকে লাইভ পাবলিশ করা হয়েছে!';
            feedbackText.className = 'text-emerald-400 font-bold';
            alert('🌟 রিল সফলভাবে ফেসবুক পেজে লাইভ আপলোড করা হয়েছে!');
            setTimeout(() => window.location.reload(), 2000);
          } else {
            feedbackText.innerText = '❌ আপলোড ব্যর্থ: ' + (json.error || 'Unknown error');
            feedbackText.className = 'text-rose-400 font-bold';
            alert('❌ রিল পাবলিশে সমস্যা: ' + (json.error || 'Unknown error'));
          }
        } catch (err) {
          feedbackText.innerText = '❌ নেটওয়ার্ক এরর: ' + err.message;
          feedbackText.className = 'text-rose-400 font-bold';
          alert('❌ নেটওয়ার্ক এরর: ' + err.message);
        } finally {
          if (btn) btn.disabled = false;
          if (spinner) spinner.classList.add('hidden');
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
            result.innerText = '✅ মেট্রিক্স সিঙ্ক সম্পন্ন হয়েছে!';
            setTimeout(() => window.location.reload(), 1500);
          } else {
            result.innerText = '❌ সিঙ্ক ত্রুটি: ' + json.error;
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

// Settings Read API
app.get('/api/settings', async (_req: Request, res: Response) => {
  try {
    const settings = getAutomationSettings();
    const scheduler = getSchedulerStatus();
    res.status(200).json({ success: true, settings, scheduler });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Settings Update API
app.post('/api/settings', async (req: Request, res: Response) => {
  try {
    const updated = updateAutomationSettings(req.body);
    rescheduleAllJobs();
    res.status(200).json({ success: true, settings: updated, scheduler: getSchedulerStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset Settings API
app.post('/api/reset-settings', async (_req: Request, res: Response) => {
  try {
    const reset = resetAutomationSettings();
    rescheduleAllJobs();
    res.status(200).json({ success: true, settings: reset });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger a specific slot immediately
app.post('/api/trigger-slot/:slotId', async (req: Request, res: Response) => {
  try {
    const slotId = req.params.slotId;
    const settings = getAutomationSettings();
    const slot = settings.slots.find((s) => s.id === slotId);

    if (!slot) {
      res.status(404).json({ success: false, error: `Slot ${slotId} not found` });
      return;
    }

    console.log(`[Manual Slot Trigger] Firing [${slot.nameBn} - ${slot.id}] immediately (Bypass Cooldown)...`);
    if (slot.type === 'REEL' || slot.id === 'slot_reel') {
      const result = await triggerAutonomousReelPost(undefined, false, slot.id, slot.category, true);
      res.status(result.success ? 200 : 500).json({
        success: result.success,
        data: result,
        error: result.error,
      });
      return;
    }

    const result = await triggerManualPost(undefined, false, slot.id, slot.category, true);

    res.status(result.success ? 200 : 500).json({
      success: result.success,
      data: result,
      error: result.error,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual Reel Trigger Endpoint
app.post('/api/trigger-reel', async (req: Request, res: Response) => {
  try {
    const customTopic = req.body?.topic as string | undefined;
    const dryRun = Boolean(req.body?.dryRun);

    console.log(`[Manual Reel Trigger] Topic: ${customTopic || 'Autonomous AI Trend'}, DryRun: ${dryRun}`);
    const result = await triggerAutonomousReelPost(customTopic, dryRun);

    res.status(result.success ? 200 : 500).json({
      success: result.success,
      message: dryRun
        ? 'Reel video synthesized and previewed successfully (Not posted to Facebook).'
        : 'Reel generated and published to Facebook successfully!',
      data: result,
      error: result.error,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stream latest generated Reel video
app.get('/api/reels/latest-video', (_req: Request, res: Response) => {
  const filePath = path.resolve(process.cwd(), 'data', 'reels', 'latest_reel.mp4');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'inline; filename="latest_reel.mp4"');
    res.sendFile(filePath);
  } else {
    res.status(404).json({ success: false, error: 'No reel generated yet.' });
  }
});

// Stream latest generated Reel audio
app.get('/api/reels/latest-audio', (_req: Request, res: Response) => {
  const filePath = path.resolve(process.cwd(), 'data', 'reels', 'latest_audio.mp3');
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline; filename="latest_audio.mp3"');
    res.sendFile(filePath);
  } else {
    res.status(404).json({ success: false, error: 'No audio generated yet.' });
  }
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
      'GET /api/settings',
      'POST /api/settings',
      'POST /api/reset-settings',
      'POST /api/trigger-slot/:slotId',
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

  const { activeSlotTasks, analyticsTask, rescheduleAllJobs: reInit } = initPublisherJob();

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    const localIp = getLocalIpAddress();
    console.log(`\n======================================================`);
    console.log(`🚀 ByteBangla 100% Autonomous 3-Post Content Hub is live!`);
    console.log(`📡 Local:   http://localhost:${env.PORT}`);
    console.log(`📱 Mobile:  http://${localIp}:${env.PORT}`);
    console.log(`🛡️  Environment: ${env.NODE_ENV}`);
    console.log(`🕒 Daily 3 Slots: 09:30 AM, 02:30 PM, 08:30 PM (Asia/Dhaka)`);
    console.log(`⚡ Mode: 100% Autonomous (No approval needed)`);
    console.log(`======================================================\n`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n[Process] ${signal} received: closing server & cron...`);
    stopAllScheduledTasks();
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
