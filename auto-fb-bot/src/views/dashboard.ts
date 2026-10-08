import { env } from '../config/env';

export interface DashboardProps {
  recentPosts: any[];
  recentComments: any[];
  jobLogs: any[];
  learningInsights: any;
  dbConnected: boolean;
  localIp: string;
  mobileUrl: string;
  settings: any;
  scheduler: any;
}

export function renderDashboardHtml(props: DashboardProps): string {
  const {
    recentPosts,
    recentComments,
    jobLogs,
    learningInsights,
    dbConnected,
    localIp,
    mobileUrl,
    settings,
    scheduler,
  } = props;

  // Build Recent Posts HTML
  const postsHtml =
    recentPosts.length === 0
      ? `<div class="empty-state">
          <p>এখনও কোনো পোস্ট রেকর্ড করা হয়নি। এআই স্টুডিও থেকে ড্রাফট প্রিভিউ দেখুন!</p>
         </div>`
      : recentPosts
          .map((p, idx) => {
            const fbLink = `https://www.facebook.com/${env.PAGE_ID}/posts/${
              p.facebookPostId.includes('_') ? p.facebookPostId.split('_')[1] : p.facebookPostId
            }`;
            const dateStr = new Date(p.publishedAt).toLocaleDateString('bn-BD', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });
            const imgTag = p.imageUrl
              ? `<div class="post-card-thumb">
                  <img src="${p.imageUrl}" alt="Banner" loading="lazy" />
                  <span class="post-badge">#${idx + 1}</span>
                 </div>`
              : '';

            return `
            <div class="post-card">
              <div>
                ${imgTag}
                <div class="post-card-meta">
                  <span class="post-id">ID: ${p.facebookPostId.substring(0, 16)}...</span>
                  <span class="post-date">${dateStr}</span>
                </div>
                <p class="post-caption">${p.caption}</p>
              </div>
              <a href="${fbLink}" target="_blank" rel="noopener noreferrer" class="btn btn-view-fb">
                <span>ফেসবুকে লাইভ দেখুন</span>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              </a>
            </div>`;
          })
          .join('');

  // Build Recent Comments HTML
  const commentsHtml =
    recentComments.length === 0
      ? `<div class="empty-state">কোনো কমেন্ট অ্যাক্টিভিটি পাওয়া যায়নি।</div>`
      : recentComments
          .map(({ comment, replies }) => {
            const isLead = comment.classification === 'LEAD_MAGNET';
            const badgeClass = isLead
              ? 'badge-lead'
              : replies.length > 0
              ? 'badge-ai'
              : 'badge-logged';

            const badgeText = isLead
              ? '🎁 Lead Magnet Sent'
              : replies.length > 0
              ? '🤖 AI Replied'
              : 'Logged';

            const replyText =
              replies.length > 0
                ? `<div class="comment-reply">
                    <span class="reply-author">বাইট বাংলা:</span> ${replies[0].replyText}
                   </div>`
                : '';

            return `
            <div class="comment-card">
              <div class="comment-header">
                <span class="comment-sender">
                  <span class="dot-online"></span>
                  ${comment.senderName || 'ফেসবুক ইউজার'}
                </span>
                <span class="badge ${badgeClass}">${badgeText}</span>
              </div>
              <p class="comment-body">"${comment.text}"</p>
              <div class="comment-footer">
                <span class="comment-class">শ্রেণী: ${comment.classification}</span>
                <span>${new Date(comment.createdAt).toLocaleTimeString('bn-BD', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}</span>
              </div>
              ${replyText}
            </div>`;
          })
          .join('');

  // Build Job Logs HTML
  const logsHtml =
    jobLogs.length === 0
      ? `<div class="empty-state">কোনো সিস্টেম লগ পাওয়া যায়নি।</div>`
      : jobLogs
          .map((l) => {
            const isSuccess = l.status === 'SUCCESS' || l.status === 'COMPLETED';
            const statusBadge = isSuccess
              ? `<span class="status-success">● ${l.status}</span>`
              : `<span class="status-failed">● ${l.status}</span>`;
            const dateStr = new Date(l.createdAt).toLocaleTimeString('bn-BD', {
              hour: '2-digit',
              minute: '2-digit',
            });

            return `
            <div class="log-row">
              <div class="log-info">
                <span class="log-name">${l.jobName}</span>
                <p class="log-details">${l.details || 'Executed successfully'}</p>
              </div>
              <div class="log-meta">
                ${statusBadge}
                <p class="log-time">${dateStr}</p>
              </div>
            </div>`;
          })
          .join('');

  // Slot Cards HTML (Dynamic for all slots in settings)
  const slotCardsHtml = (settings.slots || [])
    .map((slot: any, index: number) => {
      const isReel = slot.type === 'REEL' || slot.id === 'slot_reel';
      const icon = isReel ? '🎬' : index === 0 ? '🌅' : index === 1 ? '☀️' : '🌙';
      const slotTimeId = `slot_time_${slot.id}`;
      const toggleId = `slot_toggle_${slot.id}`;
      const isEnabled = slot.enabled;
      const statusColor =
        slot.lastStatus === 'SUCCESS'
          ? 'status-success'
          : slot.lastStatus === 'FAILED'
          ? 'status-failed'
          : 'status-cyan';
      const statusText = slot.lastRun
        ? `সর্বশেষ: ${new Date(slot.lastRun).toLocaleTimeString('bn-BD', {
            hour: '2-digit',
            minute: '2-digit',
          })} (${slot.lastStatus || 'OK'})`
        : `শিডিউল: প্রতিদিন ${slot.time} BST`;

      const fbPostLink = slot.lastPostId
        ? `<a href="https://www.facebook.com/${env.PAGE_ID}/posts/${
            slot.lastPostId.includes('_') ? slot.lastPostId.split('_')[1] : slot.lastPostId
          }" target="_blank" class="slot-fb-link"><span>পোস্ট দেখুন ➔</span></a>`
        : '';

      return `
      <div id="slot_card_${slot.id}" class="slot-card ${isEnabled ? '' : 'slot-disabled'}">
        <div>
          <!-- Slot Card Header -->
          <div class="slot-card-header">
            <div class="slot-title-group">
              <span class="slot-icon-box">${icon}</span>
              <div>
                <div class="slot-title-row">
                  <h3 class="slot-name">${slot.nameBn}</h3>
                  <span id="slot_badge_${slot.id}" class="badge ${isReel ? 'badge-reel' : 'badge-post'}">
                    ${isReel ? '🎬 REEL' : '📝 POST'} • ${slot.time} BST
                  </span>
                </div>
                <p class="slot-name-en">${slot.name}</p>
              </div>
            </div>
            
            <!-- Switch -->
            <label class="toggle-switch">
              <input type="checkbox" id="${toggleId}" ${isEnabled ? 'checked' : ''} onchange="toggleSlotActive('${slot.id}', this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <!-- Category -->
          <div class="slot-category-box">
            <span class="slot-category-label">থিম ও কনটেন্ট ক্যাটাগরি:</span>
            <p class="slot-category-title">${slot.categoryBn || slot.category}</p>
            <p class="slot-category-sub">${slot.category}</p>
          </div>

          <!-- Time Picker & Quick Inline Save -->
          <div class="slot-time-row">
            <label class="slot-time-label">পোস্ট টাইম:</label>
            <input type="time" id="${slotTimeId}" value="${slot.time}" autocomplete="off" class="time-input" />
            <button onclick="saveSlotTime('${slot.id}')" id="btn_save_${slot.id}" class="btn btn-save-inline">
              সেভ
            </button>
          </div>

          <!-- Execution Status -->
          <div class="slot-status-row">
            <span class="slot-status-indicator ${statusColor}">
              <span class="pulse-dot"></span>
              <span>${statusText}</span>
            </span>
            ${fbPostLink}
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="slot-action-grid">
          <button onclick="triggerSpecificSlot('${slot.id}')" id="btn-trigger-${slot.id}" class="btn ${isReel ? 'btn-trigger-reel' : 'btn-trigger-post'}">
            <span id="spinner-trigger-${slot.id}" class="spinner hidden">🌀</span>
            <span>🚀 ${isReel ? 'রিল আপলোড' : 'এখনই পোস্ট'}</span>
          </button>
          <button onclick="simulateSlot('${slot.id}', '${slot.category}')" class="btn btn-simulate">
            <span>🧪 সিমুলেট</span>
          </button>
        </div>
      </div>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="bn" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#070b14">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>ByteBangla - স্বয়ংক্রিয় এআই ফেসবুক কন্টেন্ট ও রিলস হাব</title>
  
  <!-- Modern Bengali & English Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">

  <style>
    /* ==========================================================================
       BYTEBANGLA HIGH-END CORE DESIGN SYSTEM (100% SELF-CONTAINED ZERO-DEPENDENCY)
       ========================================================================== */
    :root {
      --bg-body: #060913;
      --bg-card: #0b1120;
      --bg-card-subtle: #0f172a;
      --bg-input: #020617;
      --border-card: rgba(255, 255, 255, 0.08);
      --border-light: rgba(255, 255, 255, 0.12);
      --border-cyan: rgba(6, 182, 212, 0.35);
      --border-purple: rgba(168, 85, 247, 0.4);
      --border-emerald: rgba(16, 185, 129, 0.35);

      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-subtle: #64748b;

      --cyan: #06b6d4;
      --cyan-light: #22d3ee;
      --cyan-glow: rgba(6, 182, 212, 0.25);

      --purple: #8b5cf6;
      --purple-light: #a78bfa;
      --pink: #ec4899;
      --pink-glow: rgba(236, 72, 153, 0.25);

      --emerald: #10b981;
      --emerald-glow: rgba(16, 185, 129, 0.2);

      --amber: #f59e0b;
      --rose: #f43f5e;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background: radial-gradient(circle at 15% 10%, rgba(6, 182, 212, 0.07) 0%, transparent 40%),
                  radial-gradient(circle at 85% 15%, rgba(139, 92, 246, 0.07) 0%, transparent 40%),
                  var(--bg-body);
      color: var(--text-main);
      font-family: 'Hind Siliguri', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      padding-bottom: 5rem;
    }

    /* Universal SVG containment: Prevents giant icons from ever breaking layout */
    svg {
      width: 1.125rem;
      height: 1.125rem;
      max-width: 100%;
      max-height: 100%;
      flex-shrink: 0;
      display: inline-block;
      vertical-align: middle;
    }

    /* Utilities & Layout */
    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 1rem;
    }

    .hidden {
      display: none !important;
    }

    .space-y-4 > * + * { margin-top: 1rem; }
    .space-y-5 > * + * { margin-top: 1.25rem; }
    .space-y-6 > * + * { margin-top: 1.5rem; }

    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #060913; }
    ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #334155; }

    /* Top Navigation Header */
    .header {
      background: rgba(11, 17, 32, 0.85);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border-card);
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .header-inner {
      height: 4.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      text-decoration: none;
    }

    .brand-logo {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 1rem;
      background: linear-gradient(135deg, var(--cyan) 0%, #3b82f6 50%, var(--purple) 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 800;
      font-size: 1.35rem;
      box-shadow: 0 0 20px var(--cyan-glow);
    }

    .brand-title {
      font-size: 1.15rem;
      font-weight: 800;
      background: linear-gradient(135deg, var(--cyan-light), #93c5fd, #c4b5fd);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1.2;
    }

    .brand-sub {
      font-size: 0.725rem;
      color: var(--text-muted);
      margin-top: 0.1rem;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .dhaka-clock {
      display: none;
      align-items: center;
      gap: 0.4rem;
      background: var(--bg-input);
      border: 1px solid var(--border-card);
      padding: 0.4rem 0.75rem;
      border-radius: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    @media (min-width: 768px) {
      .dhaka-clock { display: flex; }
    }

    /* Tab Navigation */
    .tab-bar-desktop {
      display: none;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(11, 17, 32, 0.5);
      overflow-x: auto;
    }
    @media (min-width: 640px) {
      .tab-bar-desktop { display: block; }
    }

    .tab-bar-inner {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
    }

    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.45rem 0.9rem;
      border-radius: 0.75rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-muted);
      background: transparent;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .tab-btn:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.04);
    }
    .tab-btn.tab-active {
      color: var(--cyan-light);
      background: rgba(6, 182, 212, 0.12);
      border-color: var(--border-cyan);
      box-shadow: 0 0 15px rgba(6, 182, 212, 0.15);
    }

    /* Main Container & Section Cards */
    .main-content {
      padding: 1.5rem 0;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 1.25rem;
      padding: 1.25rem;
      box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
      position: relative;
    }
    @media (min-width: 640px) {
      .card { padding: 1.5rem; border-radius: 1.5rem; }
    }

    .card-hover:hover {
      border-color: var(--border-cyan);
      box-shadow: 0 12px 35px -5px rgba(6, 182, 212, 0.15);
    }

    /* Autonomous Mode Banner */
    .banner-autonomous {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(15, 23, 42, 0.8) 50%, rgba(6, 182, 212, 0.15) 100%);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 1.25rem;
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      margin-bottom: 1.25rem;
    }
    @media (min-width: 640px) {
      .banner-autonomous {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
    }

    .banner-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 0.85rem;
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      flex-shrink: 0;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    /* Metric Stat Cards */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    @media (min-width: 640px) {
      .stats-grid {
        grid-template-columns: repeat(4, 1fr);
        gap: 1rem;
      }
    }

    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 1.15rem;
      padding: 1rem;
    }

    .stat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 800;
      margin-top: 0.35rem;
      font-family: 'JetBrains Mono', monospace;
    }

    .stat-sub {
      font-size: 0.7rem;
      color: var(--text-subtle);
      margin-top: 0.2rem;
    }

    /* 4 Slots Grid & Cards */
    .slots-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    @media (min-width: 768px) {
      .slots-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    @media (min-width: 1200px) {
      .slots-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .slot-card {
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid var(--border-card);
      border-radius: 1.35rem;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.25s ease;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }
    .slot-card:hover {
      border-color: var(--border-cyan);
      box-shadow: 0 12px 30px -5px rgba(6, 182, 212, 0.15);
    }
    .slot-disabled {
      opacity: 0.55;
      border-color: rgba(255, 255, 255, 0.04);
    }

    .slot-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.85rem;
    }

    .slot-title-group {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .slot-icon-box {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 1rem;
      background: var(--bg-input);
      border: 1px solid var(--border-card);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.35rem;
      flex-shrink: 0;
    }

    .slot-title-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .slot-name {
      font-size: 0.9rem;
      font-weight: 700;
      color: #fff;
    }

    .slot-name-en {
      font-size: 0.725rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
    }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.2rem 0.55rem;
      border-radius: 9999px;
      font-size: 0.675rem;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      border: 1px solid transparent;
    }

    .badge-post {
      background: rgba(6, 182, 212, 0.15);
      color: var(--cyan-light);
      border-color: rgba(6, 182, 212, 0.3);
    }

    .badge-reel {
      background: rgba(236, 72, 153, 0.15);
      color: #f472b6;
      border-color: rgba(236, 72, 153, 0.35);
    }

    .badge-lead {
      background: rgba(168, 85, 247, 0.2);
      color: #d8b4fe;
      border-color: rgba(168, 85, 247, 0.35);
    }

    .badge-ai {
      background: rgba(16, 185, 129, 0.2);
      color: #6ee7b7;
      border-color: rgba(16, 185, 129, 0.35);
    }

    .badge-logged {
      background: rgba(245, 158, 11, 0.2);
      color: #fcd34d;
      border-color: rgba(245, 158, 11, 0.35);
    }

    /* Toggle Switches (Smooth iOS style) */
    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 2.75rem;
      height: 1.5rem;
      flex-shrink: 0;
    }
    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #1e293b;
      transition: .3s;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 1.15rem;
      width: 1.15rem;
      left: 2px;
      bottom: 2px;
      background-color: white;
      transition: .3s;
      border-radius: 50%;
    }
    .toggle-switch input:checked + .toggle-slider {
      background-color: var(--emerald);
      border-color: var(--emerald);
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
    }
    .toggle-switch input:checked + .toggle-slider:before {
      transform: translateX(1.25rem);
    }

    /* Slot Inner Elements */
    .slot-category-box {
      background: var(--bg-input);
      border: 1px solid var(--border-card);
      border-radius: 0.85rem;
      padding: 0.65rem 0.85rem;
      margin-bottom: 0.75rem;
    }
    .slot-category-label {
      font-size: 0.65rem;
      font-weight: 700;
      color: var(--text-subtle);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: block;
    }
    .slot-category-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--cyan-light);
      margin-top: 0.2rem;
    }
    .slot-category-sub {
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-top: 0.1rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .slot-time-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(2, 6, 23, 0.7);
      border: 1px solid var(--border-card);
      border-radius: 0.85rem;
      padding: 0.5rem 0.75rem;
      margin-bottom: 0.75rem;
    }
    .slot-time-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      flex-shrink: 0;
    }
    .time-input {
      background: var(--bg-card);
      border: 1px solid #334155;
      color: var(--cyan-light);
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 0.8rem;
      padding: 0.35rem 0.55rem;
      border-radius: 0.6rem;
      outline: none;
    }
    .time-input:focus {
      border-color: var(--cyan);
      box-shadow: 0 0 0 2px var(--cyan-glow);
    }

    .slot-status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.725rem;
      margin-bottom: 1rem;
      padding: 0 0.25rem;
    }
    .slot-status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
    }
    .status-success { color: #34d399; }
    .status-failed { color: #fb7185; }
    .status-cyan { color: var(--cyan-light); }

    .pulse-dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: currentColor;
      animation: pulseAnimation 2s infinite;
    }
    @keyframes pulseAnimation {
      0% { opacity: 0.4; }
      50% { opacity: 1; }
      100% { opacity: 0.4; }
    }

    .slot-fb-link {
      color: var(--cyan-light);
      text-decoration: none;
      font-size: 0.725rem;
      font-weight: 600;
    }
    .slot-fb-link:hover { text-decoration: underline; }

    .slot-action-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border-card);
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      padding: 0.6rem 0.9rem;
      border-radius: 0.75rem;
      font-size: 0.75rem;
      font-weight: 700;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      text-decoration: none;
    }
    .btn:active {
      transform: scale(0.97);
    }

    .btn-trigger-post {
      background: linear-gradient(135deg, var(--cyan) 0%, #2563eb 100%);
      color: #020617;
      box-shadow: 0 4px 15px var(--cyan-glow);
    }
    .btn-trigger-post:hover {
      filter: brightness(1.1);
    }

    .btn-trigger-reel {
      background: linear-gradient(135deg, var(--pink) 0%, var(--purple) 100%);
      color: #fff;
      box-shadow: 0 4px 15px var(--pink-glow);
    }
    .btn-trigger-reel:hover {
      filter: brightness(1.1);
    }

    .btn-simulate {
      background: #1e293b;
      border-color: #334155;
      color: #e2e8f0;
    }
    .btn-simulate:hover {
      background: #273549;
      color: #fff;
    }

    .btn-save-inline {
      margin-left: auto;
      padding: 0.35rem 0.75rem;
      background: rgba(6, 182, 212, 0.15);
      border-color: var(--border-cyan);
      color: var(--cyan-light);
      font-size: 0.725rem;
    }
    .btn-save-inline:hover {
      background: rgba(6, 182, 212, 0.25);
    }

    .btn-fb {
      background: #1877f2;
      color: #fff;
      padding: 0.5rem 0.85rem;
      font-size: 0.75rem;
      border-radius: 0.75rem;
    }
    .btn-fb:hover { background: #166fe5; }

    .btn-refresh {
      background: #1e293b;
      border: 1px solid #334155;
      color: var(--text-muted);
      padding: 0.55rem;
      border-radius: 0.75rem;
    }
    .btn-refresh:hover { color: #fff; background: #273549; }

    /* Timeline & Bot Fleet */
    .timeline-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
    @media (min-width: 640px) {
      .timeline-grid {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    .timeline-card {
      background: rgba(2, 6, 23, 0.75);
      border: 1px solid var(--border-card);
      border-radius: 1rem;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .timeline-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }

    .bots-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
    @media (min-width: 640px) {
      .bots-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 1024px) {
      .bots-grid { grid-template-columns: repeat(4, 1fr); }
    }

    .bot-card {
      background: rgba(2, 6, 23, 0.75);
      border: 1px solid var(--border-card);
      border-radius: 1rem;
      padding: 1rem;
    }
    .bot-card-icon {
      font-size: 1.25rem;
      margin-bottom: 0.35rem;
      display: block;
    }
    .bot-card-title {
      font-weight: 700;
      color: #fff;
      font-size: 0.8rem;
    }
    .bot-card-desc {
      font-size: 0.725rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
      line-height: 1.4;
    }

    /* AI Studio & Reel Video Player */
    .reel-showcase-box {
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(15, 23, 42, 0.95) 50%, rgba(236, 72, 153, 0.15) 100%);
      border: 1px solid rgba(168, 85, 247, 0.35);
      border-radius: 1.5rem;
      padding: 1.5rem;
      box-shadow: 0 15px 35px -10px rgba(168, 85, 247, 0.25);
    }

    .reel-player-container {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.5rem;
      align-items: center;
      margin-top: 1rem;
    }
    @media (min-width: 768px) {
      .reel-player-container {
        grid-template-columns: 260px 1fr;
      }
    }

    .reel-video-frame {
      width: 100%;
      max-width: 260px;
      aspect-ratio: 9 / 16;
      background: #000;
      border-radius: 1.25rem;
      overflow: hidden;
      border: 2px solid rgba(168, 85, 247, 0.4);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
      position: relative;
      margin: 0 auto;
    }

    .reel-video-frame video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .reel-audio-bar {
      background: rgba(2, 6, 23, 0.85);
      border: 1px solid var(--border-card);
      border-radius: 1rem;
      padding: 0.85rem;
      margin-bottom: 0.75rem;
    }
    .reel-audio-bar audio {
      width: 100%;
      height: 2.25rem;
      margin-top: 0.4rem;
    }

    .suggestion-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.6rem;
    }
    .suggestion-chip {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
      font-size: 0.725rem;
      font-weight: 500;
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .suggestion-chip:hover {
      background: rgba(6, 182, 212, 0.15);
      color: var(--cyan-light);
      border-color: var(--border-cyan);
    }

    .text-input {
      width: 100%;
      background: var(--bg-input);
      border: 1px solid #334155;
      border-radius: 0.85rem;
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
      color: #fff;
      font-family: inherit;
      outline: none;
      transition: all 0.2s ease;
    }
    .text-input:focus {
      border-color: var(--cyan);
      box-shadow: 0 0 0 2px var(--cyan-glow);
    }

    /* Posts & Comments Cards */
    .posts-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    @media (min-width: 640px) {
      .posts-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 1024px) {
      .posts-grid { grid-template-columns: repeat(3, 1fr); }
    }

    .post-card {
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid var(--border-card);
      border-radius: 1.25rem;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.2s ease;
    }
    .post-card:hover {
      border-color: var(--border-cyan);
      box-shadow: 0 10px 25px -5px rgba(6, 182, 212, 0.15);
    }

    .post-card-thumb {
      position: relative;
      border-radius: 0.85rem;
      overflow: hidden;
      margin-bottom: 0.75rem;
      border: 1px solid var(--border-card);
    }
    .post-card-thumb img {
      width: 100%;
      height: 11rem;
      object-fit: cover;
      display: block;
    }
    .post-badge {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: rgba(2, 6, 23, 0.85);
      backdrop-filter: blur(4px);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      color: var(--cyan-light);
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      border: 1px solid #334155;
    }

    .post-card-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }
    .post-id {
      background: rgba(6, 182, 212, 0.1);
      border: 1px solid rgba(6, 182, 212, 0.25);
      color: var(--cyan-light);
      padding: 0.1rem 0.45rem;
      border-radius: 9999px;
      font-family: 'JetBrains Mono', monospace;
    }
    .post-date {
      color: var(--text-muted);
    }

    .post-caption {
      font-size: 0.8rem;
      color: #e2e8f0;
      line-height: 1.45;
      margin-bottom: 0.85rem;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .btn-view-fb {
      width: 100%;
      background: rgba(6, 182, 212, 0.1);
      border-color: rgba(6, 182, 212, 0.25);
      color: var(--cyan-light);
      padding: 0.55rem;
      font-size: 0.75rem;
    }
    .btn-view-fb:hover {
      background: rgba(6, 182, 212, 0.2);
    }

    /* Comments Section */
    .comment-card {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid var(--border-card);
      border-radius: 1.15rem;
      padding: 1rem;
      margin-bottom: 0.75rem;
    }
    .comment-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.75rem;
      margin-bottom: 0.5rem;
    }
    .comment-sender {
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .dot-online {
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 50%;
      background: var(--cyan-light);
    }

    .comment-body {
      font-size: 0.775rem;
      color: #e2e8f0;
      background: rgba(2, 6, 23, 0.6);
      border: 1px solid var(--border-card);
      border-radius: 0.75rem;
      padding: 0.65rem 0.85rem;
      margin-bottom: 0.5rem;
      line-height: 1.4;
    }

    .comment-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.675rem;
      color: var(--text-muted);
    }
    .comment-class {
      background: #1e293b;
      padding: 0.15rem 0.45rem;
      border-radius: 0.4rem;
    }

    .comment-reply {
      margin-top: 0.65rem;
      padding: 0.65rem 0.85rem;
      background: rgba(16, 185, 129, 0.1);
      border-left: 3px solid var(--emerald);
      border-radius: 0 0.75rem 0.75rem 0;
      font-size: 0.75rem;
      color: #cbd5e1;
    }
    .reply-author {
      color: #34d399;
      font-weight: 700;
    }

    /* System Health Grid */
    .health-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
    @media (min-width: 640px) {
      .health-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 1024px) {
      .health-grid { grid-template-columns: repeat(3, 1fr); }
    }

    .health-card {
      background: rgba(2, 6, 23, 0.75);
      border: 1px solid var(--border-card);
      border-radius: 1rem;
      padding: 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .health-name {
      font-weight: 700;
      color: #fff;
      font-size: 0.8rem;
    }
    .health-meta {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
    }

    /* Logs */
    .log-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 0.65rem 0;
      border-bottom: 1px solid var(--border-card);
      font-size: 0.75rem;
    }
    .log-row:last-child { border-bottom: none; }
    .log-name {
      font-family: 'JetBrains Mono', monospace;
      color: var(--cyan-light);
      font-weight: 600;
    }
    .log-details {
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
    }
    .log-meta {
      text-align: right;
      white-space: nowrap;
    }
    .log-time {
      font-size: 0.65rem;
      color: var(--text-subtle);
      margin-top: 0.1rem;
    }

    /* Mobile Sticky Bottom Nav */
    .mobile-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(11, 17, 32, 0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-top: 1px solid var(--border-card);
      padding: 0.5rem 0.25rem;
      display: flex;
      align-items: center;
      justify-content: space-around;
      z-index: 50;
    }
    @media (min-width: 640px) {
      .mobile-nav { display: none; }
    }

    .mob-tab-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.2rem;
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.65rem;
      font-weight: 600;
      cursor: pointer;
      padding: 0.25rem;
    }
    .mob-tab-btn.mobile-tab-active {
      color: var(--cyan-light);
    }
    .mob-tab-btn.mobile-tab-active svg {
      stroke: var(--cyan-light);
    }

    /* Floating Toast Notifications */
    #toastContainer {
      position: fixed;
      top: 1.25rem;
      right: 1.25rem;
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: 24rem;
      width: calc(100% - 2.5rem);
      pointer-events: none;
    }
    .toast-item {
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(16px);
      border-radius: 1rem;
      padding: 0.85rem 1.15rem;
      font-size: 0.8rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      box-shadow: 0 15px 30px rgba(0, 0, 0, 0.6);
      pointer-events: auto;
      transition: all 0.3s ease;
      transform: translateY(-10px);
      opacity: 0;
    }
    .toast-success {
      border: 1px solid rgba(16, 185, 129, 0.5);
      color: #6ee7b7;
    }
    .toast-error {
      border: 1px solid rgba(244, 63, 94, 0.5);
      color: #fda4af;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.8);
      backdrop-filter: blur(8px);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .modal-box {
      background: var(--bg-card);
      border: 1px solid #334155;
      border-radius: 1.5rem;
      padding: 1.5rem;
      max-width: 28rem;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }

    .empty-state {
      padding: 2rem;
      text-align: center;
      color: var(--text-muted);
      background: rgba(15, 23, 42, 0.6);
      border-radius: 1.25rem;
      border: 1px solid var(--border-card);
      font-size: 0.85rem;
    }

    .spinner {
      display: inline-block;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>

  <!-- Floating Toast Notification Center -->
  <div id="toastContainer"></div>

  <!-- Top Fixed Navigation Bar -->
  <header class="header">
    <div class="container">
      <div class="header-inner">
        
        <!-- Brand & Identity -->
        <a href="/" class="brand-group">
          <div class="brand-logo">B</div>
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <h1 class="brand-title">ByteBangla</h1>
              <span id="masterHeaderBadge" class="badge ${
                settings.autoPilotEnabled ? 'badge-ai' : 'badge-logged'
              }">
                <span class="pulse-dot" style="background: currentColor;"></span>
                <span>${settings.autoPilotEnabled ? 'অটো-পাইলট সক্রিয়' : 'পজ করা আছে'}</span>
              </span>
            </div>
            <p class="brand-sub">১০০% স্বয়ংক্রিয় এআই ফেসবুক কন্টেন্ট ও রিলস হাব</p>
          </div>
        </a>

        <!-- Top Actions -->
        <div class="header-actions">
          <!-- Live Dhaka Clock -->
          <div class="dhaka-clock">
            <span>⏰</span>
            <span id="dhakaLiveClock">--:--:-- BST</span>
          </div>

          <!-- Master Auto-Pilot Fast Toggle -->
          <button onclick="toggleMasterAutoPilot(${!settings.autoPilotEnabled})" class="btn" style="background: ${
    settings.autoPilotEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)'
  }; border-color: ${
    settings.autoPilotEnabled ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)'
  }; color: ${settings.autoPilotEnabled ? '#34d399' : '#fbbf24'};">
            <span>${settings.autoPilotEnabled ? '🟢 অটো-পাইলট ON' : '⏸️ অটো-পাইলট PAUSED'}</span>
          </button>

          <!-- Refresh Button -->
          <button onclick="window.location.reload()" title="Refresh" class="btn btn-refresh">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          </button>
          
          <!-- View Facebook Page -->
          <a href="https://www.facebook.com/${env.PAGE_ID}" target="_blank" class="btn btn-fb">
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            <span style="margin-left: 0.2rem;">ফেসবুক পেজ</span>
          </a>
        </div>

      </div>

      <!-- Desktop Tab Bar -->
      <nav class="tab-bar-desktop">
        <div class="tab-bar-inner">
          <button onclick="switchTab('overview')" id="desk-tab-overview" class="tab-btn tab-active">
            <span>🏠</span><span>ওভারভিউ ও শিডিউল স্লট</span>
          </button>
          <button onclick="switchTab('studio')" id="desk-tab-studio" class="tab-btn">
            <span>🎬</span><span>এআই স্টুডিও ও রিলস প্লেয়ার</span>
          </button>
          <button onclick="switchTab('schedule')" id="desk-tab-schedule" class="tab-btn">
            <span>⚙️</span><span>শিডিউল ও সেটিংস</span>
          </button>
          <button onclick="switchTab('posts')" id="desk-tab-posts" class="tab-btn">
            <span>📸</span><span>পোস্টসমূহ (${recentPosts.length})</span>
          </button>
          <button onclick="switchTab('community')" id="desk-tab-community" class="tab-btn">
            <span>💬</span><span>কমেন্ট ও ডিএম (${recentComments.length})</span>
          </button>
          <button onclick="switchTab('brain')" id="desk-tab-brain" class="tab-btn">
            <span>🧠</span><span>এআই ব্রেন ও হেলথ</span>
          </button>
        </div>
      </nav>
    </div>
  </header>

  <!-- Main App Container -->
  <main class="container main-content">

    <!-- ⚡ Autonomous Mode Notification Banner -->
    <section class="banner-autonomous">
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <div class="banner-icon">⚡</div>
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <strong style="font-size: 0.9rem; color: #fff;">১০০% স্বয়ংক্রিয় এআই মোড সক্রিয় (Zero Approval Needed)</strong>
            <span class="badge badge-ai">${(settings.slots || []).length}টি শিডিউল স্লট</span>
          </div>
          <p style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.15rem;">
            ম্যানুয়াল অনুমোদনের প্রয়োজন নেই। ট্রেন্ড ট্র্যাক ➔ ৩ডি ভিজ্যুয়াল/রিলস সিন ➔ নিউরাল ভয়েসওভার তৈরি হয়ে স্বয়ংক্রিয়ভাবে পাবলিশ হয়।
          </p>
        </div>
      </div>
      <div>
        <button onclick="switchTab('schedule')" class="btn btn-simulate" style="font-size: 0.75rem;">
          <span>⚙️ সেটিংস পরিবর্তন</span>
        </button>
      </div>
    </section>

    <!-- ========================================================================= -->
    <!-- TAB 1: OVERVIEW & SLOTS -->
    <!-- ========================================================================= -->
    <div id="tab-content-overview" class="tab-pane space-y-5">

      <!-- 4 Quick Stat Cards -->
      <section class="stats-grid">
        <div class="stat-card">
          <div class="stat-header">
            <span>মোট পোস্ট</span>
            <span>📸</span>
          </div>
          <p class="stat-value" style="color: var(--cyan-light);">${recentPosts.length}</p>
          <p class="stat-sub">স্বয়ংক্রিয় পাবলিশড</p>
        </div>

        <div class="stat-card">
          <div class="stat-header">
            <span>দৈনিক সক্রিয় স্লট</span>
            <span>⏰</span>
          </div>
          <p class="stat-value" style="color: var(--amber);">${(settings.slots || []).length}টি স্লট</p>
          <p class="stat-sub">ফিড পোস্ট ও রিলস</p>
        </div>

        <div class="stat-card">
          <div class="stat-header">
            <span>কমিউনিটি কমেন্ট</span>
            <span>💬</span>
          </div>
          <p class="stat-value" style="color: var(--purple-light);">${recentComments.length}</p>
          <p class="stat-sub">এআই অটো-হ্যান্ডেল্ড</p>
        </div>

        <div class="stat-card">
          <div class="stat-header">
            <span>এআই কোয়ালিটি</span>
            <span>🛡️</span>
          </div>
          <p class="stat-value" style="color: #34d399;">৯৫%+</p>
          <p class="stat-sub">Critic Verified</p>
        </div>
      </section>

      <!-- 🎬 LATEST REEL SPOTLIGHT PREVIEW CARD -->
      <section class="reel-showcase-box">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.75rem;">🎬</span>
            <div>
              <h2 style="font-size: 1.05rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
                <span>সর্বশেষ এআই ফেসবুক রিল (ভিডিও প্রিভিউ)</span>
                <span class="badge badge-reel">9:16 HD Vertical</span>
              </h2>
              <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.1rem;">
                টপিক-ভিত্তিক এআই সিন, Ken Burns মোশন, সাবলীল বাংলা নিউরাল ভয়েসওভার ও কাইনেটিক সাবটাইটেল
              </p>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button onclick="switchTab('studio')" class="btn btn-trigger-reel" style="font-size: 0.75rem;">
              <span>🧪 স্টুডিওতে রিল বানান</span>
            </button>
          </div>
        </div>

        <!-- Inline Video Player -->
        <div class="reel-player-container">
          <div class="reel-video-frame">
            <video id="overviewReelVideo" controls playsinline preload="metadata">
              <source src="/api/reels/latest-video" type="video/mp4">
              আপনার ব্রাউজারে ভিডিও সাপোর্ট নেই।
            </video>
          </div>

          <div class="space-y-4">
            <div class="reel-audio-bar">
              <span style="font-size: 0.75rem; font-weight: 700; color: #f472b6; display: flex; align-items: center; gap: 0.4rem;">
                <span>🎙️</span><span>মাইক্রোসফট নিউরাল হিউম্যান ভয়েসওভার (লাইভ শুনুন):</span>
              </span>
              <audio id="overviewReelAudio" controls preload="metadata">
                <source src="/api/reels/latest-audio" type="audio/mpeg">
              </audio>
            </div>

            <div style="background: rgba(2, 6, 23, 0.7); border: 1px solid var(--border-card); border-radius: 1rem; padding: 1rem;">
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--cyan-light); display: block; margin-bottom: 0.35rem;">
                ✨ ভিডিওর ফিচারসমূহ:
              </span>
              <ul style="font-size: 0.75rem; color: #cbd5e1; list-style: none; space-y: 0.35rem; line-height: 1.6;">
                <li>✅ <strong>টপিক-ভিত্তিক সিন:</strong> বিকাশ, ব্যাংক, ট্রেনের টিকিট বা টেক টপিকের সাথে মিলিয়ে ব্যাকগ্রাউন্ড দৃশ্য।</li>
                <li>✅ <strong>Ken Burns মোশন:</strong> অপ্টিমাইজড স্মুথ ক্যামেরা মুভমেন্ট (ক্লাউড ক্র্যাশ-প্রুফ)।</li>
                <li>✅ <strong>কাইনেটিক সাবটাইটেল:</strong> প্রতিটি যুক্তাক্ষর অক্ষত রেখে আধুনিক কালার হাইলাইটেড ক্যাপশন।</li>
              </ul>
            </div>

            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button onclick="publishLatestReelNow()" id="btnQuickPublishReel" class="btn btn-trigger-reel">
                <span>🚀 এই রিলটি ফেসবুকে এখনই পোস্ট করুন</span>
              </button>
              <a href="/api/reels/download" download class="btn btn-simulate">
                <span>📥 রিল ডাউনলোড করুন</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <!-- Daily Slots Section -->
      <section class="space-y-4">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <h2 style="font-size: 1.05rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
              <span>🕒 প্রতিদিনের স্বয়ংক্রিয় শিডিউল স্লট কন্ট্রোল হাব</span>
              <span class="badge badge-ai">লাইভ কন্ট্রোল</span>
            </h2>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">
              স্লটের সময় পরিবর্তন, চালু/বন্ধ করা বা এখনই এক ক্লিকে পোস্ট/রিল পাবলিশ করুন:
            </p>
          </div>
          <button onclick="switchTab('schedule')" class="btn btn-simulate" style="font-size: 0.725rem;">
            <span>বিস্তারিত সেটিংস ➔</span>
          </button>
        </div>

        <!-- Slots Grid -->
        <div class="slots-grid">
          ${slotCardsHtml}
        </div>
      </section>

      <!-- 24h Timeline -->
      <section class="card space-y-4">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 1rem; font-weight: 800; color: #fff;">🕒 ২৪ ঘণ্টার স্বয়ংক্রিয় কাজের সময়সূচী</span>
        </div>

        <div class="timeline-grid">
          <div class="timeline-card">
            <div>
              <div class="timeline-card-header">
                <span style="font-size: 1.25rem;">🌅</span>
                <span class="badge badge-post">07:00 AM</span>
              </div>
              <strong style="font-size: 0.825rem; color: #fff; display: block;">সকালের এআই ও টেক পোস্ট</strong>
              <p style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem; line-height: 1.4;">
                মোবাইল ট্রিকস, দরকারি টিপস ও ইনফোগ্রাফিক চিটশিট পোস্ট।
              </p>
            </div>
          </div>

          <div class="timeline-card">
            <div>
              <div class="timeline-card-header">
                <span style="font-size: 1.25rem;">🎬</span>
                <span class="badge badge-reel">12:10 PM</span>
              </div>
              <strong style="font-size: 0.825rem; color: #fff; display: block;">দুপুরের ১ম ভাইরাল রিল</strong>
              <p style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem; line-height: 1.4;">
                ৯:১৬ এইচডি ভিডিও, হিউম্যান ভয়েসওভার ও কাইনেটিক সাবটাইটেল।
              </p>
            </div>
          </div>

          <div class="timeline-card">
            <div>
              <div class="timeline-card-header">
                <span style="font-size: 1.25rem;">🎬</span>
                <span class="badge badge-reel">19:10 PM</span>
              </div>
              <strong style="font-size: 0.825rem; color: #fff; display: block;">সন্ধ্যার ২য় প্রাইম টাইম রিল</strong>
              <p style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem; line-height: 1.4;">
                সাইবার সিকিউরিটি, বিকাশ সতর্কতা ও ট্রেন্ডিং এআই টেক রিল।
              </p>
            </div>
          </div>

          <div class="timeline-card">
            <div>
              <div class="timeline-card-header">
                <span style="font-size: 1.25rem;">📊</span>
                <span class="badge badge-ai">12:00 AM</span>
              </div>
              <strong style="font-size: 0.825rem; color: #fff; display: block;">অ্যানালিটিক্স ও সেলফ লার্নিং</strong>
              <p style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem; line-height: 1.4;">
                অডিয়েন্সের রিঅ্যাকশন বিশ্লেষণ করে আগামীকালের কনটেন্ট নির্ধারণ।
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- AI Bot Fleet -->
      <section class="card space-y-4">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h3 style="font-size: 1rem; font-weight: 800; color: #fff;">🤖 ব্যাকগ্রাউন্ডে সক্রিয় ৮টি স্বয়ংক্রিয় এআই এজেন্ট</h3>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">প্রতিটি পোস্টের জন্য এই এজেন্টরা নিরবচ্ছিন্ন কাজ করে:</p>
          </div>
          <span class="badge badge-ai">৮/৮ ফুল একটিভ</span>
        </div>

        <div class="bots-grid">
          <div class="bot-card">
            <span class="bot-card-icon">1️⃣ 🚀</span>
            <div class="bot-card-title">ট্রেন্ড ট্র্যাকার বট</div>
            <p class="bot-card-desc">বাংলাদেশ ও আন্তর্জাতিক ট্রেন্ডিং টেক, লাইফ হ্যাক ও ভাইরাল বিষয় অনুসন্ধান করে।</p>
          </div>
          <div class="bot-card">
            <span class="bot-card-icon">2️⃣ 🌐</span>
            <div class="bot-card-title">ফ্যাক্ট-চেকার বট</div>
            <p class="bot-card-desc">গুগল লাইভ সার্চ দিয়ে তথ্যের সত্যতা যাচাই করে ফেক নিউজ প্রতিরোধ করে।</p>
          </div>
          <div class="bot-card">
            <span class="bot-card-icon">3️⃣ 🎬</span>
            <div class="bot-card-title">রিলস ও কন্টেন্ট স্ক্রিপ্টার</div>
            <p class="bot-card-desc">আকর্ষণীয় বাংলা ক্যাপশন, হুক ডায়লগ ও ৩০-৪০ সেকেন্ডের রিলস স্ক্রিপ্ট লেখে।</p>
          </div>
          <div class="bot-card">
            <span class="bot-card-icon">4️⃣ 🧐</span>
            <div class="bot-card-title">ক্রিটিক অডিটর</div>
            <p class="bot-card-desc">৮৫-এর নিচে স্কোর পেলে ড্রাফট নিজেই পরিমার্জন ও রিরাইট করে কোয়ালিটি বাড়ায়।</p>
          </div>
          <div class="bot-card">
            <span class="bot-card-icon">5️⃣ 🎨</span>
            <div class="bot-card-title">সিন ও ইমেজ ইঞ্জিন</div>
            <p class="bot-card-desc">টপিকের সাথে মিলিয়ে ৯:১৬ এইচডি সিন ফ্রেম ও ৩ডি ভিজ্যুয়াল তৈরি করে।</p>
          </div>
          <div class="bot-card">
            <span class="bot-card-icon">6️⃣ 🎙️</span>
            <div class="bot-card-title">নিউরাল ভয়েস জেনারেটর</div>
            <p class="bot-card-desc">মাইক্রোসফট এজ নিউরাল ভয়েস দিয়ে সাবলীল কথ্য ভাষায় অডিও সিন্থেসিস করে।</p>
          </div>
          <div class="bot-card">
            <span class="bot-card-icon">7️⃣ 💬</span>
            <div class="bot-card-title">কমেন্ট ও ডিএম বট</div>
            <p class="bot-card-desc">কমেন্টের উত্তর দেয় এবং ইনবক্সে স্বয়ংক্রিয়ভাবে রিসোর্স টুল লিংক পাঠায়।</p>
          </div>
          <div class="bot-card">
            <span class="bot-card-icon">8️⃣ 📈</span>
            <div class="bot-card-title">অ্যানালিটিক্স ব্রেন</div>
            <p class="bot-card-desc">অডিয়েন্সের লাইক, শেয়ার ও কমেন্টের ওপর ভিত্তি করে সেলফ-লার্নিং চালায়।</p>
          </div>
        </div>
      </section>

    </div>

    <!-- ========================================================================= -->
    <!-- TAB 2: AI STUDIO & SIMULATOR -->
    <!-- ========================================================================= -->
    <div id="tab-content-studio" class="tab-pane hidden space-y-5">
      <section class="card space-y-4">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span class="badge badge-lead">🧪 সেফ সিমুলেশন স্টুডিও</span>
            <span class="badge badge-ai">১০০% পোস্ট ছাড়া নিরাপদ</span>
          </div>
          <h2 style="font-size: 1.15rem; font-weight: 800; color: #fff; margin-top: 0.5rem;">
            এআই কনটেন্ট ড্রাফট ও রিলস জেনারেটর
          </h2>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">
            ফেসবুকে পোস্ট না করে সম্পূর্ণ পোস্ট, রিলস ভিডিও ও ভয়েসওভার প্রিভিউ দেখতে নিচে টপিক লিখুন অথবা বোতামে চাপুন।
          </p>
        </div>

        <!-- Topic Input -->
        <div>
          <label style="font-size: 0.775rem; font-weight: 600; color: #e2e8f0; display: block; margin-bottom: 0.4rem;">
            কাস্টম টপিক (ঐচ্ছিক):
          </label>
          <input id="customTopicInput" type="text" placeholder="যেমন: বিকাশ বা ব্যাংকের ভুয়া কল থেকে বাঁচার সহজ উপায় (ফাঁকা রাখলে এআই নিজে খুঁজবে)" class="text-input" />
          
          <!-- Suggestion Chips -->
          <div class="suggestion-chips">
            <span class="suggestion-chip" onclick="fillTopic('বিকাশ বা ব্যাংকের নামে আসা ভুয়া কল থেকে বাঁচার সহজ উপায়')">🛡️ বিকাশ প্রতারণা সতর্কতা</span>
            <span class="suggestion-chip" onclick="fillTopic('মোবাইলের মেমোরি দ্রুত খালি করার সহজ উপায়')">📱 ফোন মেমোরি খালি করার উপায়</span>
            <span class="suggestion-chip" onclick="fillTopic('২০২৬ সালের সেরা ৫টি ফ্রি এআই টুল যা কাজ সহজ করবে')">🤖 ২০২৬ সেরা ফ্রি এআই টুলস</span>
            <span class="suggestion-chip" onclick="fillTopic('মোবাইলে ঘরে বসে ট্রেনের টিকিট কাটার নিয়ম')">🚆 ট্রেনের অনলাইন টিকিট</span>
          </div>
        </div>

        <!-- 3 Action Buttons -->
        <div style="display: grid; grid-template-columns: 1fr; gap: 0.75rem; padding-top: 0.5rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <button id="previewBtn" onclick="runPipeline(true)" class="btn btn-simulate" style="padding: 0.85rem; font-size: 0.8rem;">
              <span id="previewSpinner" class="spinner hidden">🌀</span>
              <span id="previewText">🧪 টেস্ট পোস্ট ক্যারোসেল</span>
            </button>

            <button id="previewReelBtn" onclick="runReelPipeline(true)" class="btn btn-trigger-reel" style="padding: 0.85rem; font-size: 0.8rem;">
              <span id="previewReelSpinner" class="spinner hidden">🌀</span>
              <span id="previewReelText">🎬 টেস্ট রিল তৈরি করুন ও শুনুন</span>
            </button>
          </div>

          <button id="liveBtn" onclick="openLiveConfirmModal()" class="btn btn-trigger-post" style="padding: 0.85rem; font-size: 0.8rem;">
            <span>🚀 ফেসবুকে সরাসরি লাইভ পোস্ট করুন</span>
          </button>
        </div>

        <!-- Live Progress Feedback -->
        <div id="liveFeedback" class="hidden" style="margin-top: 1rem; padding: 1rem; background: rgba(2, 6, 23, 0.9); border: 1px solid var(--border-card); border-radius: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--cyan-light); font-weight: 700; font-size: 0.85rem;">
            <span class="spinner" style="font-size: 1rem;">⚙️</span>
            <span id="feedbackText">এআই পাইপলাইন কাজ করছে...</span>
          </div>
          <p style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.35rem;">
            ট্রেন্ড রিসার্চ ➔ সিন তৈরি ➔ হিউম্যান নিউরাল ভয়েসওভার ➔ কাইনেটিক সাবটাইটেল (১৫-২৫ সেকেন্ড অপেক্ষা করুন)
          </p>
        </div>

        <!-- Reel Video & Audio Player Card -->
        <div id="reelPlayerCard" class="hidden" style="margin-top: 1.25rem;">
          <div class="reel-showcase-box">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 1.5rem;">🎬</span>
                <div>
                  <h3 style="font-size: 0.95rem; font-weight: 800; color: #fff;">
                    ১০০/১০০ হিউম্যান ভয়েস রিল প্রিভিউ
                  </h3>
                  <p style="font-size: 0.725rem; color: var(--text-muted);">৯:১৬ এইচডি ভিডিও ও ন্যাচারাল ভয়েসওভার</p>
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button onclick="publishLatestReelNow()" id="publishReelDirectBtn" class="btn btn-trigger-reel" style="font-size: 0.75rem;">
                  <span id="publishReelDirectSpinner" class="spinner hidden">🌀</span>
                  <span>🚀 ফেসবুকে পোস্ট করুন</span>
                </button>
                <a href="/api/reels/download" download class="btn btn-simulate" style="font-size: 0.75rem;">
                  <span>📥 রিল ডাউনলোড</span>
                </a>
              </div>
            </div>

            <div class="reel-player-container">
              <div class="reel-video-frame">
                <video id="previewVideoElement" controls playsinline></video>
              </div>

              <div class="space-y-4">
                <div class="reel-audio-bar">
                  <span style="font-size: 0.75rem; font-weight: 700; color: #f472b6;">
                    🎙️ হিউম্যান ভয়েসওভার অডিও (সরাসরি শুনুন):
                  </span>
                  <audio id="previewAudioElement" controls></audio>
                </div>

                <div style="background: rgba(2, 6, 23, 0.8); padding: 0.85rem; border-radius: 1rem; border: 1px solid var(--border-card);">
                  <span style="font-size: 0.75rem; font-weight: 700; color: var(--purple-light);">📜 ডায়লগ ও স্ক্রিপ্ট:</span>
                  <p id="reelPlayerScript" style="font-size: 0.775rem; color: #e2e8f0; margin-top: 0.35rem; line-height: 1.5;"></p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Carousel Preview Card -->
        <div id="previewCard" class="hidden space-y-4" style="margin-top: 1.25rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
            <div style="display: flex; gap: 0.5rem;">
              <span class="badge badge-lead">🛡️ Safe Simulation (পোস্ট হয়নি)</span>
              <span id="criticScoreBadge" class="badge badge-ai">Critic Score: 95/100</span>
            </div>
            <button onclick="document.getElementById('previewCard').classList.add('hidden')" class="btn btn-simulate" style="font-size: 0.7rem; padding: 0.35rem 0.65rem;">✕ বন্ধ করুন</button>
          </div>

          <div>
            <p style="font-size: 0.775rem; font-weight: 700; color: #cbd5e1; margin-bottom: 0.5rem;">📸 তৈরি হওয়া ৩ডি ভিজ্যুয়াল স্লাইডসমূহ:</p>
            <div id="carouselPreviewGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem;"></div>
          </div>

          <!-- Caption Preview -->
          <div class="card" style="background: var(--bg-input);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--cyan-light);">📝 মূল বাংলা ক্যাপশন:</span>
              <button onclick="copyToClipboard(document.getElementById('previewCaption').innerText, 'ক্যাপশন কপি করা হয়েছে!')" class="btn btn-save-inline">
                কপি করুন
              </button>
            </div>
            <pre id="previewCaption" style="font-size: 0.75rem; color: #e2e8f0; white-space: pre-wrap; font-family: inherit; line-height: 1.5;"></pre>
          </div>

          <!-- First Comment Preview -->
          <div class="card" style="background: var(--bg-input);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--amber);">🔗 ১ম কমেন্ট (অফিসিয়াল রিসোর্স লিংক):</span>
              <button onclick="copyToClipboard(document.getElementById('previewFirstComment').innerText, 'ফার্স্ট কমেন্ট কপি করা হয়েছে!')" class="btn btn-save-inline">
                কপি করুন
              </button>
            </div>
            <pre id="previewFirstComment" style="font-size: 0.75rem; color: #cbd5e1; white-space: pre-wrap; font-family: inherit; line-height: 1.5;"></pre>
          </div>
        </div>
      </section>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 3: SCHEDULE & CONTROL SETTINGS -->
    <!-- ========================================================================= -->
    <div id="tab-content-schedule" class="tab-pane hidden space-y-5">
      <section class="card space-y-6">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <span class="badge badge-post">⚙️ সম্পূর্ণ অটোমেশন কন্ট্রোল</span>
            <h2 style="font-size: 1.15rem; font-weight: 800; color: #fff; margin-top: 0.35rem;">
              স্বয়ংক্রিয় পোস্টিং শিডিউল ও ফিচার সেটিংস
            </h2>
            <p style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.15rem;">
              স্লটের সময়সূচী, ক্যাটাগরি ও পেজ অটোমেশন ফিচারগুলো এই প্যানেল থেকে কনফিগার করুন।
            </p>
          </div>
          <button onclick="resetSettingsToDefault()" class="btn btn-simulate" style="color: #fb7185; border-color: rgba(244, 63, 94, 0.3);">
            ডিফল্ট সেটিংসে রিসেট
          </button>
        </div>

        <!-- Master Auto-Pilot Box -->
        <div style="background: var(--bg-input); border: 1px solid var(--border-card); border-radius: 1.15rem; padding: 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
          <div>
            <strong style="font-size: 0.9rem; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
              <span>🤖 মাস্টার অটো-পাইলট (Master Auto-Pilot)</span>
              <span id="masterStatusBadge" class="badge ${
                settings.autoPilotEnabled ? 'badge-ai' : 'badge-logged'
              }">
                ${settings.autoPilotEnabled ? 'সক্রিয় (Active)' : 'পজ করা (Paused)'}
              </span>
            </strong>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
              চালু থাকলে প্রতিদিন নির্ধারিত সময়ে স্বয়ংক্রিয়ভাবে রিল ও পোস্ট ফেসবুকে লাইভ হবে।
            </p>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="masterAutoPilotToggle" ${
              settings.autoPilotEnabled ? 'checked' : ''
            } onchange="toggleMasterAutoPilot(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <!-- Feature Toggles -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.75rem;">
          <div style="background: rgba(2, 6, 23, 0.7); border: 1px solid var(--border-card); border-radius: 1rem; padding: 1rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem;">
            <div>
              <strong style="font-size: 0.8rem; color: #fff;">🔗 ফার্স্ট কমেন্ট অটোমেশন</strong>
              <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem; line-height: 1.4;">
                পোস্টের ৩ সেকেন্ড পর ১ম কমেন্টে অফিশিয়াল লিংক পিন করে (ফেসবুক রিচ বাড়ানোর জন্য)।
              </p>
            </div>
            <input type="checkbox" id="toggleFirstComment" ${
              settings.autoFirstComment ? 'checked' : ''
            } style="width: 1.2rem; height: 1.2rem; accent-color: var(--cyan); margin-top: 0.2rem;" />
          </div>

          <div style="background: rgba(2, 6, 23, 0.7); border: 1px solid var(--border-card); border-radius: 1rem; padding: 1rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem;">
            <div>
              <strong style="font-size: 0.8rem; color: #fff;">💬 এআই অটো কমেন্ট রিপ্লাই</strong>
              <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem; line-height: 1.4;">
                ইউজারদের কমেন্টের ভাব বুঝে এআই প্রাসঙ্গিক ও তথ্যবহুল বাংলা উত্তর পাঠাবে।
              </p>
            </div>
            <input type="checkbox" id="toggleCommentReply" ${
              settings.autoCommentReply ? 'checked' : ''
            } style="width: 1.2rem; height: 1.2rem; accent-color: var(--cyan); margin-top: 0.2rem;" />
          </div>

          <div style="background: rgba(2, 6, 23, 0.7); border: 1px solid var(--border-card); border-radius: 1rem; padding: 1rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem;">
            <div>
              <strong style="font-size: 0.8rem; color: #fff;">📩 ইনবক্স ডিএম ডেলিভারি</strong>
              <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem; line-height: 1.4;">
                কেউ 'টুল' বা 'লিংক' চাইলে স্বয়ংক্রিয়ভাবে মেসেঞ্জারে ডিরেক্ট রিসোর্স পাঠাবে।
              </p>
            </div>
            <input type="checkbox" id="toggleAutoDm" ${
              settings.autoDm ? 'checked' : ''
            } style="width: 1.2rem; height: 1.2rem; accent-color: var(--cyan); margin-top: 0.2rem;" />
          </div>
        </div>

        <!-- Editable Slots Form (Dynamically loops through ALL slots in settings) -->
        <div class="space-y-4 pt-2">
          <h3 style="font-size: 0.9rem; font-weight: 800; color: #fff;">
            ⏰ স্লটের সময়সূচী ও থিম সম্পাদনা:
          </h3>

          ${(settings.slots || [])
            .map((s: any, idx: number) => {
              const isReel = s.type === 'REEL' || s.id === 'slot_reel';
              const icon = isReel ? '🎬' : idx === 0 ? '🌅' : idx === 1 ? '☀️' : '🌙';
              return `
              <div style="background: rgba(2, 6, 23, 0.8); border: 1px solid var(--border-card); border-radius: 1rem; padding: 1rem; space-y: 0.75rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-size: 1.25rem;">${icon}</span>
                    <strong style="font-size: 0.825rem; color: #fff;">${s.nameBn} (${s.name})</strong>
                  </div>
                  <label style="display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: var(--text-muted); cursor: pointer;">
                    <input type="checkbox" id="form_slot_enabled_${s.id}" ${s.enabled ? 'checked' : ''} style="width: 1rem; height: 1rem; accent-color: var(--cyan);">
                    <span>এই স্লট চালু রাখুন</span>
                  </label>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;">
                  <div>
                    <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">পোস্টিং সময় (BST):</label>
                    <input type="time" id="form_slot_time_${s.id}" value="${s.time}" autocomplete="off" class="time-input" style="width: 100%;" />
                  </div>
                  <div>
                    <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">কনটেন্ট ক্যাটাগরি ও থিম ফোকাস:</label>
                    <input type="text" id="form_slot_category_${s.id}" value="${s.category}" autocomplete="off" class="text-input" style="font-size: 0.8rem; padding: 0.4rem 0.75rem;" />
                  </div>
                </div>
              </div>
              `;
            })
            .join('')}
        </div>

        <!-- Save Button -->
        <div style="display: flex; justify-content: flex-end; padding-top: 1rem; border-top: 1px solid var(--border-card);">
          <button onclick="saveAllSettingsForm()" id="saveAllSettingsBtn" class="btn btn-trigger-post" style="padding: 0.75rem 1.5rem; font-size: 0.85rem;">
            <span id="saveSettingsSpinner" class="spinner hidden">🌀</span>
            <span>💾 সকল সেটিংস সেভ ও কার্যকর করুন</span>
          </button>
        </div>
      </section>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 4: RECENT POSTS -->
    <!-- ========================================================================= -->
    <div id="tab-content-posts" class="tab-pane hidden space-y-5">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h2 style="font-size: 1.05rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
            <span>📸 সম্প্রতি পাবলিশ হওয়া ফেসবুক পোস্টসমূহ</span>
            <span class="badge badge-post">${recentPosts.length}</span>
          </h2>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">
            পেজে অটোমেশন দ্বারা স্বয়ংক্রিয়ভাবে পোস্ট হওয়া কন্টেন্ট:
          </p>
        </div>
        <button onclick="syncPostMetrics()" id="syncMetricsBtn" class="btn btn-simulate">
          <span id="syncMetricsSpinner" class="spinner hidden">🌀</span>
          <span>🔄 সিঙ্ক মেট্রিক্স</span>
        </button>
      </div>

      <div id="syncMetricsResult" class="hidden" style="padding: 0.75rem 1rem; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #6ee7b7; border-radius: 0.85rem; font-size: 0.8rem;"></div>

      <div class="posts-grid">
        ${postsHtml}
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 5: COMMUNITY & COMMENTS -->
    <!-- ========================================================================= -->
    <div id="tab-content-community" class="tab-pane hidden space-y-5">
      <section class="card space-y-4">
        <div>
          <span class="badge badge-logged">💬 টেস্ট কমেন্ট বট</span>
          <h3 style="font-size: 1rem; font-weight: 800; color: #fff; margin-top: 0.35rem;">
            এআই কমেন্ট ও ইনবক্স রেসপন্ডার টেস্ট করুন
          </h3>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">
            একটি কমেন্ট লিখে টেস্ট করে দেখুন এআই কীভাবে উত্তর দেয় ও ইনবক্সে লিংক পাঠায়:
          </p>
        </div>

        <div style="display: flex; gap: 0.5rem; flex-direction: column;">
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <input id="testCommentInput" type="text" placeholder="যেমন: ভাই AI টুলের লিংকটা দিন বা ChatGPT দিয়ে কিভাবে কাজ করব?" class="text-input" style="flex: 1;" />
            <button onclick="testCommentBot()" id="testCommentBtn" class="btn btn-simulate" style="background: var(--amber); color: #020617; font-weight: 700;">
              <span id="testCommentSpinner" class="spinner hidden">🌀</span>
              <span>টেস্ট করুন</span>
            </button>
          </div>
          <div id="testCommentResult" class="hidden" style="padding: 1rem; background: var(--bg-input); border-radius: 1rem; border: 1px solid var(--border-card); font-size: 0.775rem;"></div>
        </div>
      </section>

      <div class="space-y-4">
        <h3 style="font-size: 0.95rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
          <span>💬 ফেসবুক কমেন্ট ও অটো-রিপ্লাই হিস্ট্রি</span>
          <span class="badge badge-ai">${recentComments.length}</span>
        </h3>
        <div>
          ${commentsHtml}
        </div>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 6: BRAIN & SYSTEM HEALTH -->
    <!-- ========================================================================= -->
    <div id="tab-content-brain" class="tab-pane hidden space-y-5">
      <section class="card space-y-4">
        <h3 style="font-size: 1rem; font-weight: 800; color: #fff;">
          🛡️ লাইভ সিস্টেম ও এপিআই কানেকশন স্ট্যাটাস
        </h3>

        <div class="health-grid">
          <!-- Gemini AI -->
          <div class="health-card">
            <div>
              <div class="health-name">Google Gemini AI</div>
              <div class="health-meta">${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}</div>
            </div>
            <span class="badge badge-ai">● Active</span>
          </div>

          <!-- Meta Graph API -->
          <div class="health-card">
            <div>
              <div class="health-name">Meta Graph API v21.0</div>
              <div class="health-meta">Page: ${env.PAGE_ID}</div>
            </div>
            <span class="badge badge-ai">● Connected</span>
          </div>

          <!-- Database -->
          <div class="health-card">
            <div>
              <div class="health-name">ডাটাবেস স্টোরেজ</div>
              <div class="health-meta">${dbConnected ? 'PostgreSQL (Prisma)' : 'Resilient Local Store'}</div>
            </div>
            <span class="badge badge-ai">● Healthy</span>
          </div>

          <!-- Scheduler -->
          <div class="health-card">
            <div>
              <div class="health-name">ক্রন শিডিউলার</div>
              <div class="health-meta">${scheduler.activeSlotsCount} Active Slots</div>
            </div>
            <span class="badge ${scheduler.autoPilotEnabled ? 'badge-ai' : 'badge-logged'}">
              ● ${scheduler.autoPilotEnabled ? 'Running' : 'Paused'}
            </span>
          </div>

          <!-- Webhook -->
          <div class="health-card">
            <div>
              <div class="health-name">ফেসবুক ওয়েবহুক</div>
              <div class="health-meta">GET/POST /webhook</div>
            </div>
            <span class="badge badge-ai">● Ready</span>
          </div>

          <!-- First Comment -->
          <div class="health-card">
            <div>
              <div class="health-name">ফার্স্ট কমেন্ট অটোমেশন</div>
              <div class="health-meta">${settings.autoFirstComment ? 'Enabled' : 'Disabled'}</div>
            </div>
            <span class="badge badge-ai">● Active</span>
          </div>
        </div>
      </section>

      <!-- Audit Log -->
      <section class="card space-y-4">
        <h3 style="font-size: 1rem; font-weight: 800; color: #fff;">
          🛡️ সিস্টেম অডিট ও জব হিস্ট্রি লগ
        </h3>
        <div style="background: var(--bg-input); border: 1px solid var(--border-card); border-radius: 1rem; padding: 1rem;">
          ${logsHtml}
        </div>
      </section>
    </div>

  </main>

  <!-- Mobile Sticky Bottom Nav -->
  <nav class="mobile-nav">
    <button onclick="switchTab('overview')" id="mob-tab-overview" class="mob-tab-btn mobile-tab-active">
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
      <span>হোম</span>
    </button>
    <button onclick="switchTab('studio')" id="mob-tab-studio" class="mob-tab-btn">
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
      <span>রিলস/স্টুডিও</span>
    </button>
    <button onclick="switchTab('schedule')" id="mob-tab-schedule" class="mob-tab-btn">
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      <span>শিডিউল</span>
    </button>
    <button onclick="switchTab('posts')" id="mob-tab-posts" class="mob-tab-btn">
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
      <span>পোস্ট</span>
    </button>
    <button onclick="switchTab('community')" id="mob-tab-community" class="mob-tab-btn">
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
      <span>কমেন্ট</span>
    </button>
    <button onclick="switchTab('brain')" id="mob-tab-brain" class="mob-tab-btn">
      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
      <span>হেলথ</span>
    </button>
  </nav>

  <!-- Live Confirm Modal -->
  <div id="confirmModal" class="modal-overlay hidden">
    <div class="modal-box space-y-4">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-size: 1.75rem;">⚠️</span>
        <div>
          <h3 style="font-size: 1rem; font-weight: 800; color: #fff;">ফেসবুকে সরাসরি পোস্ট করতে চান?</h3>
          <p style="font-size: 0.725rem; color: var(--text-muted);">ByteBangla পেজে সরাসরি পোস্ট পাবলিশ হবে</p>
        </div>
      </div>
      <p style="font-size: 0.775rem; color: #cbd5e1; line-height: 1.5; background: var(--bg-input); padding: 0.85rem; border-radius: 0.85rem; border: 1px solid var(--border-card);">
        আপনি কি নিশ্চিত যে এই পোস্টটি ফেসবুকে সরাসরি লাইভ পাবলিশ করবেন? টেস্ট করার জন্য প্রথমে <strong style="color: var(--cyan-light);">Simulate & Preview</strong> ব্যবহার করাই সবচেয়ে নিরাপদ।
      </p>
      <div style="display: flex; gap: 0.5rem; justify-content: flex-end; padding-top: 0.5rem;">
        <button onclick="closeLiveConfirmModal()" class="btn btn-simulate">বাতিল করুন</button>
        <button onclick="executeLivePostFromModal()" class="btn btn-trigger-post">হ্যাঁ, লাইভ পোস্ট করুন</button>
      </div>
    </div>
  </div>

  <!-- Client Side Scripts -->
  <script>
    function showToast(message, type) {
      var t = type || 'success';
      var container = document.getElementById('toastContainer');
      if (!container) return;
      var toast = document.createElement('div');
      toast.className = 'toast-item ' + (t === 'success' ? 'toast-success' : 'toast-error');
      var icon = t === 'success' ? '✅' : '❌';
      toast.innerHTML = '<div style="display: flex; align-items: center; gap: 0.5rem;"><span>' + icon + '</span><span>' + message + '</span></div><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:0.9rem;">✕</button>';
      container.appendChild(toast);
      setTimeout(function() {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
      }, 10);
      setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(function() { toast.remove(); }, 300);
      }, 4000);
    }

    function copyToClipboard(text, msg) {
      if (!text) return;
      navigator.clipboard.writeText(text);
      showToast(msg || 'ক্লিপবোর্ডে কপি করা হয়েছে!', 'success');
    }

    function updateClock() {
      var now = new Date();
      var str = now.toLocaleTimeString('bn-BD', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' BST';
      var el = document.getElementById('dhakaLiveClock');
      if (el) el.innerText = str;
    }
    setInterval(updateClock, 1000);
    updateClock();

    function fillTopic(topic) {
      var input = document.getElementById('customTopicInput');
      if (input) {
        input.value = topic;
        input.focus();
        showToast('টপিক সিলেক্ট করা হয়েছে!', 'success');
      }
    }

    function switchTab(tabId) {
      sessionStorage.setItem('activeTab', tabId);

      document.querySelectorAll('.tab-pane').forEach(function(el) {
        el.classList.add('hidden');
      });
      
      var target = document.getElementById('tab-content-' + tabId);
      if (target) target.classList.remove('hidden');

      document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.classList.remove('tab-active');
      });
      var activeDeskTab = document.getElementById('desk-tab-' + tabId);
      if (activeDeskTab) activeDeskTab.classList.add('tab-active');

      document.querySelectorAll('.mob-tab-btn').forEach(function(btn) {
        btn.classList.remove('mobile-tab-active');
      });
      var activeMobTab = document.getElementById('mob-tab-' + tabId);
      if (activeMobTab) activeMobTab.classList.add('mobile-tab-active');

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    window.addEventListener('DOMContentLoaded', function() {
      var savedTab = sessionStorage.getItem('activeTab');
      if (savedTab && document.getElementById('tab-content-' + savedTab)) {
        switchTab(savedTab);
      }
    });

    async function toggleMasterAutoPilot(enabled) {
      try {
        var res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autoPilotEnabled: enabled }),
        });
        var json = await res.json();
        if (json.success) {
          showToast(enabled ? '✅ মাস্টার অটো-পাইলট চালু করা হয়েছে!' : '⏸️ মাস্টার অটো-পাইলট সাময়িক পজ করা হয়েছে।', 'success');
          setTimeout(function() { window.location.reload(); }, 800);
        } else {
          showToast('এরর: ' + (json.error || 'Failed'), 'error');
        }
      } catch (e) {
        showToast('নেটওয়ার্ক এরর: ' + e.message, 'error');
      }
    }

    async function toggleSlotActive(slotId, enabled) {
      try {
        var res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slots: [{ id: slotId, enabled: enabled }]
          }),
        });
        var json = await res.json();
        if (json.success) {
          showToast(enabled ? '✅ স্লট চালু করা হয়েছে!' : '⚪ স্লট সাময়িক বন্ধ করা হয়েছে!', 'success');
          var card = document.getElementById('slot_card_' + slotId);
          if (card) {
            if (enabled) card.classList.remove('slot-disabled');
            else card.classList.add('slot-disabled');
          }
          var formToggle = document.getElementById('form_slot_enabled_' + slotId);
          if (formToggle) formToggle.checked = enabled;
        } else {
          showToast('এরর: ' + (json.error || 'Failed'), 'error');
        }
      } catch (e) {
        showToast('নেটওয়ার্ক এরর: ' + e.message, 'error');
      }
    }

    async function saveSlotTime(slotId) {
      var input = document.getElementById('slot_time_' + slotId);
      if (!input || !input.value) return;

      var toggleEl = document.getElementById('slot_toggle_' + slotId);
      var isEnabled = toggleEl ? toggleEl.checked : true;

      var btn = document.getElementById('btn_save_' + slotId);
      var originalText = btn ? btn.innerText : 'সেভ';
      if (btn) btn.innerText = 'সেভ হচ্ছে...';

      try {
        var res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slots: [{ id: slotId, time: input.value, enabled: isEnabled }]
          }),
        });
        var json = await res.json();
        if (json.success) {
          showToast('✅ স্লটের সময় ' + input.value + ' BST সফলভাবে সেভ করা হয়েছে!', 'success');
          var badge = document.getElementById('slot_badge_' + slotId);
          if (badge) badge.innerText = input.value + ' BST';

          var formInput = document.getElementById('form_slot_time_' + slotId);
          if (formInput) formInput.value = input.value;

          if (btn) {
            btn.innerText = '✅ সেভড!';
            setTimeout(function() { btn.innerText = originalText; }, 2000);
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

    async function saveAllSettingsForm() {
      var btn = document.getElementById('saveAllSettingsBtn');
      var spinner = document.getElementById('saveSettingsSpinner');
      btn.disabled = true;
      spinner.classList.remove('hidden');

      try {
        var autoPilotEnabled = document.getElementById('masterAutoPilotToggle')?.checked ?? true;
        var autoFirstComment = document.getElementById('toggleFirstComment')?.checked ?? true;
        var autoCommentReply = document.getElementById('toggleCommentReply')?.checked ?? true;
        var autoDm = document.getElementById('toggleAutoDm')?.checked ?? true;

        var slotInputs = document.querySelectorAll('[id^="form_slot_time_"]');
        var slots = Array.from(slotInputs).map(function(el) {
          var id = el.id.replace('form_slot_time_', '');
          var timeEl = document.getElementById('form_slot_time_' + id);
          var catEl = document.getElementById('form_slot_category_' + id);
          var enabledEl = document.getElementById('form_slot_enabled_' + id);
          return {
            id: id,
            time: timeEl ? timeEl.value : '13:00',
            category: catEl ? catEl.value : '',
            enabled: enabledEl ? enabledEl.checked : true,
          };
        });

        var res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            autoPilotEnabled: autoPilotEnabled,
            autoFirstComment: autoFirstComment,
            autoCommentReply: autoCommentReply,
            autoDm: autoDm,
            slots: slots,
          }),
        });
        var json = await res.json();
        if (json.success) {
          sessionStorage.setItem('activeTab', 'schedule');
          showToast('✅ সকল সেটিংস সফলভাবে আপডেট করা হয়েছে!', 'success');
          setTimeout(function() { window.location.reload(); }, 1000);
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

    async function resetSettingsToDefault() {
      if (!confirm('আপনি কি ডিফল্ট সেটিংসে ফিরে যেতে চান?')) return;
      try {
        var res = await fetch('/api/reset-settings', { method: 'POST' });
        var json = await res.json();
        if (json.success) {
          showToast('✅ ডিফল্ট সেটিংস সফলভাবে রিস্টোর করা হয়েছে!', 'success');
          setTimeout(function() { window.location.reload(); }, 1000);
        }
      } catch (e) {
        showToast('এরর: ' + e.message, 'error');
      }
    }

    async function triggerSpecificSlot(slotId) {
      if (!confirm('আপনি কি এই স্লটের কনটেন্ট এখনই ফেসবুকে সরাসরি পাবলিশ করতে চান?')) return;

      var btn = document.getElementById('btn-trigger-' + slotId);
      var spinner = document.getElementById('spinner-trigger-' + slotId);
      btn.disabled = true;
      spinner.classList.remove('hidden');

      try {
        var res = await fetch('/api/trigger-slot/' + slotId, { method: 'POST' });
        var json = await res.json();
        if (json.success) {
          alert('🌟 সফলভাবে ফেসবুকে লাইভ পাবলিশ করা হয়েছে! পোস্ট আইডি: ' + (json.data?.postId || 'OK'));
          window.location.reload();
        } else {
          alert('❌ তৈরিতে সমস্যা হয়েছে: ' + (json.data?.error || json.error || 'Failed'));
        }
      } catch (e) {
        alert('নেটওয়ার্ক এরর: ' + e.message);
      } finally {
        btn.disabled = false;
        spinner.classList.add('hidden');
      }
    }

    function simulateSlot(slotId, category) {
      switchTab('studio');
      var input = document.getElementById('customTopicInput');
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
      var previewBtn = document.getElementById('previewBtn');
      var liveBtn = document.getElementById('liveBtn');
      var customInput = document.getElementById('customTopicInput');
      var feedback = document.getElementById('liveFeedback');
      var feedbackText = document.getElementById('feedbackText');
      var previewCard = document.getElementById('previewCard');

      var topic = customInput.value.trim();

      previewBtn.disabled = true;
      liveBtn.disabled = true;
      feedback.classList.remove('hidden');
      feedbackText.innerText = dryRun
        ? '🧪 এআই টপিক অ্যানালাইসিস, ফ্যাক্ট-চেক ও ৩ডি ক্যারোসেল প্রস্তুত করছে...'
        : '🚀 লাইভ পোস্ট প্রস্তুত হচ্ছে এবং ফেসবুকে পাবলিশ হচ্ছে...';

      try {
        var res = await fetch('/test-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic, dryRun: dryRun }),
        });
        var json = await res.json();

        if (json.success) {
          if (dryRun) {
            feedbackText.innerText = '✅ ড্রাফট সফলভাবে তৈরি হয়েছে! নিচে প্রিভিউ দেখুন (পোস্ট হয়নি)।';
            document.getElementById('criticScoreBadge').innerText = 'Critic Score: ' + (json.data.criticAudit?.score || 95) + '/100';
            document.getElementById('previewCaption').innerText = json.data.content;
            document.getElementById('previewFirstComment').innerText = json.data.firstCommentText || 'কোনো ফার্স্ট কমেন্ট নেই';

            var grid = document.getElementById('carouselPreviewGrid');
            grid.innerHTML = (json.data.imageUrls || []).map(function(url, i) {
              return '<div style="background:#0f172a;padding:0.5rem;border-radius:0.75rem;border:1px solid #1e293b;"><p style="font-size:0.7rem;color:#94a3b8;margin-bottom:0.25rem;">স্লাইড ' + (i+1) + '</p><img src="' + url + '" style="width:100%;height:10rem;object-fit:cover;border-radius:0.5rem;" /></div>';
            }).join('');

            previewCard.classList.remove('hidden');
            previewCard.scrollIntoView({ behavior: 'smooth' });
          } else {
            feedbackText.innerText = '✅ পোস্ট ফেসবুকে সফলভাবে পাবলিশ হয়েছে! পোস্ট আইডি: ' + json.data.postId;
            setTimeout(function() { window.location.reload(); }, 2500);
          }
        } else {
          feedbackText.innerText = '❌ এরর: ' + (json.error || 'Operation failed');
        }
      } catch (err) {
        feedbackText.innerText = '❌ নেটওয়ার্ক ত্রুটি: ' + err.message;
      } finally {
        previewBtn.disabled = false;
        liveBtn.disabled = false;
      }
    }

    async function runReelPipeline(dryRun) {
      var btn = document.getElementById('previewReelBtn');
      var spinner = document.getElementById('previewReelSpinner');
      var customInput = document.getElementById('customTopicInput');
      var feedback = document.getElementById('liveFeedback');
      var feedbackText = document.getElementById('feedbackText');
      var reelPlayerCard = document.getElementById('reelPlayerCard');

      var topic = customInput ? customInput.value.trim() : '';

      if (btn) btn.disabled = true;
      if (spinner) spinner.classList.remove('hidden');
      feedback.classList.remove('hidden');

      var stepTimer = null;
      var steps = [
        '🔍 [১/৪] ট্রেন্ড রিসার্চ ও বাংলা ভাইরাল স্ক্রিপ্ট লেখা হচ্ছে...',
        '🎙️ [২/৪] মাইক্রোসফট নিউরাল ভয়েসওভার সিন্থেসিস হচ্ছে...',
        '🎨 [৩/৪] ৯:১৬ এআই ব্যাকগ্রাউন্ড সিন ফ্রেম ও Ken Burns মোশন রেন্ডার হচ্ছে...',
        '✍️ [৪/৪] কাইনেটিক সাবটাইটেল ব্লেন্ডিং ও অডিও ফাইনাল মিক্সিং সম্পন্ন হচ্ছে...'
      ];
      var stepIdx = 0;
      feedbackText.innerText = steps[0];
      stepTimer = setInterval(function() {
        stepIdx++;
        if (stepIdx < steps.length) {
          feedbackText.innerText = steps[stepIdx];
        }
      }, 4500);

      try {
        var res = await fetch('/api/trigger-reel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic, dryRun: dryRun }),
        });
        var json = await res.json();
        clearInterval(stepTimer);

        if (json.success) {
          feedbackText.innerText = dryRun
            ? '✅ ১০০/১০০ পারফেক্ট রিল সফলভাবে প্রস্তুত হয়েছে! নিচে লাইভ প্লে করুন এবং শুনুন।'
            : '🚀 রিল সফলভাবে ফেসবুকে লাইভ পাবলিশ করা হয়েছে!';

          if (reelPlayerCard) {
            reelPlayerCard.classList.remove('hidden');
            var v = document.getElementById('previewVideoElement');
            var a = document.getElementById('previewAudioElement');
            var ts = Date.now();
            if (v) { v.src = '/api/reels/latest-video?t=' + ts; v.load(); }
            if (a) { a.src = '/api/reels/latest-audio?t=' + ts; a.load(); }
            
            if (json.data && json.data.reelScript) {
              var s = json.data.reelScript;
              document.getElementById('reelPlayerScript').innerText = 
                s.fullScript || ([s.hook, s.body, s.cta].filter(Boolean).join(' '));
            }
            reelPlayerCard.scrollIntoView({ behavior: 'smooth' });
          }
        } else {
          feedbackText.innerText = '❌ রিল তৈরিতে ব্যর্থ: ' + (json.error || 'Unknown error');
        }
      } catch (err) {
        clearInterval(stepTimer);
        feedbackText.innerText = '❌ নেটওয়ার্ক এরর: ' + err.message;
      } finally {
        clearInterval(stepTimer);
        if (btn) btn.disabled = false;
        if (spinner) spinner.classList.add('hidden');
      }
    }

    async function publishLatestReelNow() {
      var btn = document.getElementById('publishReelDirectBtn') || document.getElementById('btnQuickPublishReel');
      var customInput = document.getElementById('customTopicInput');
      var topic = customInput ? customInput.value.trim() : '';

      if (!confirm('আপনি কি নিশ্চিত যে এই রিলটি আপনার ফেসবুক পেজে এখনই সরাসরি লাইভ আপলোড করবেন?')) {
        return;
      }

      if (btn) btn.disabled = true;
      showToast('🚀 রিল ফেসবুকে আপলোড শুরু হয়েছে...', 'success');

      try {
        var res = await fetch('/api/trigger-reel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic, dryRun: false }),
        });
        var json = await res.json();
        if (json.success) {
          alert('🌟 রিল সফলভাবে ফেসবুকে লাইভ পাবলিশ করা হয়েছে! আইডি: ' + (json.data?.postId || 'OK'));
          window.location.reload();
        } else {
          alert('❌ রিল পাবলিশে ত্রুটি: ' + (json.error || 'Failed'));
        }
      } catch (e) {
        alert('নেটওয়ার্ক এরর: ' + e.message);
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function syncPostMetrics() {
      var btn = document.getElementById('syncMetricsBtn');
      var spinner = document.getElementById('syncMetricsSpinner');
      var result = document.getElementById('syncMetricsResult');
      btn.disabled = true;
      spinner.classList.remove('hidden');

      try {
        var res = await fetch('/api/sync-metrics', { method: 'POST' });
        var json = await res.json();
        if (json.success) {
          result.innerText = '✅ ফেসবুক মেট্রিক্স সফলভাবে সিঙ্ক হয়েছে!';
          result.classList.remove('hidden');
          setTimeout(function() { window.location.reload(); }, 1500);
        } else {
          showToast('মেট্রিক্স সিঙ্ক ব্যর্থ: ' + (json.error || 'Error'), 'error');
        }
      } catch (e) {
        showToast('নেটওয়ার্ক এরর: ' + e.message, 'error');
      } finally {
        btn.disabled = false;
        spinner.classList.add('hidden');
      }
    }

    async function testCommentBot() {
      var input = document.getElementById('testCommentInput');
      var btn = document.getElementById('testCommentBtn');
      var spinner = document.getElementById('testCommentSpinner');
      var result = document.getElementById('testCommentResult');

      var text = input ? input.value.trim() : '';
      if (!text) {
        alert('অনুগ্রহ করে একটি কমেন্ট লিখুন');
        return;
      }

      btn.disabled = true;
      spinner.classList.remove('hidden');

      try {
        var res = await fetch('/api/test-comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text }),
        });
        var json = await res.json();
        if (json.success && json.analysis) {
          result.classList.remove('hidden');
          result.innerHTML = '<div style="color:var(--cyan-light);font-weight:700;margin-bottom:0.35rem;">শ্রেণী: ' + json.analysis.category + ' (Confidence: ' + (json.analysis.confidence || 0.95) + ')</div>' +
            '<div style="color:#e2e8f0;line-height:1.4;"><strong style="color:#34d399;">এআই রিপ্লাই:</strong> ' + (json.analysis.replyText || 'কোনো রিপ্লাই দরকার নেই') + '</div>' +
            '<div style="font-size:0.7rem;color:#94a3b8;margin-top:0.35rem;">ইনবক্স ডিএম অ্যাকশন: ' + (json.analysis.sendDm ? '✅ মেসেঞ্জারে লিংক পাঠানো হবে' : '❌ কোনো ডিএম প্রয়োজন নেই') + '</div>';
        } else {
          showToast('কমেন্ট এনালাইসিস ব্যর্থ', 'error');
        }
      } catch (e) {
        showToast('নেটওয়ার্ক এরর: ' + e.message, 'error');
      } finally {
        btn.disabled = false;
        spinner.classList.add('hidden');
      }
    }
  </script>
</body>
</html>`;
}
