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
import { renderDashboardHtml } from './views/dashboard';

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

  const html = renderDashboardHtml({
    recentPosts,
    recentComments,
    jobLogs,
    learningInsights,
    dbConnected,
    localIp,
    mobileUrl,
    settings,
    scheduler,
  });

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
  const possiblePaths = [
    path.resolve(process.cwd(), 'data', 'reels', 'latest_reel.mp4'),
    path.resolve(process.cwd(), 'auto-fb-bot', 'data', 'reels', 'latest_reel.mp4'),
    path.resolve(__dirname, '..', 'data', 'reels', 'latest_reel.mp4'),
    path.resolve(__dirname, '..', '..', 'data', 'reels', 'latest_reel.mp4'),
  ];
  const found = possiblePaths.find((p) => fs.existsSync(p));
  if (found) {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'inline; filename="latest_reel.mp4"');
    res.sendFile(found);
  } else {
    res.status(404).json({ success: false, error: 'No reel generated yet.' });
  }
});

// Download latest generated Reel video (Direct attachment)
app.get('/api/reels/download', (_req: Request, res: Response) => {
  const possiblePaths = [
    path.resolve(process.cwd(), 'data', 'reels', 'latest_reel.mp4'),
    path.resolve(process.cwd(), 'auto-fb-bot', 'data', 'reels', 'latest_reel.mp4'),
    path.resolve(__dirname, '..', 'data', 'reels', 'latest_reel.mp4'),
    path.resolve(__dirname, '..', '..', 'data', 'reels', 'latest_reel.mp4'),
  ];
  const found = possiblePaths.find((p) => fs.existsSync(p));
  if (found) {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="ByteBangla_Reel_${Date.now()}.mp4"`);
    res.sendFile(found);
  } else {
    res.status(404).json({ success: false, error: 'No reel generated yet.' });
  }
});

// Stream latest generated Reel audio
app.get('/api/reels/latest-audio', (_req: Request, res: Response) => {
  const possiblePaths = [
    path.resolve(process.cwd(), 'data', 'reels', 'latest_audio.mp3'),
    path.resolve(process.cwd(), 'auto-fb-bot', 'data', 'reels', 'latest_audio.mp3'),
    path.resolve(__dirname, '..', 'data', 'reels', 'latest_audio.mp3'),
    path.resolve(__dirname, '..', '..', 'data', 'reels', 'latest_audio.mp3'),
  ];
  const found = possiblePaths.find((p) => fs.existsSync(p));
  if (found) {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline; filename="latest_audio.mp3"');
    res.sendFile(found);
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

  // Self Keep-Alive Pinger (Prevents free cloud tiers like Render from sleeping)
  const keepAliveTimer = setInterval(() => {
    try {
      const http = require('http');
      http.get(`http://localhost:${env.PORT}/health`, () => {}).on('error', () => {});
    } catch {}
  }, 10 * 60 * 1000);

  const shutdown = (signal: string) => {
    console.log(`\n[Process] ${signal} received: closing server & cron...`);
    clearInterval(keepAliveTimer);
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
