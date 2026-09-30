import cron, { ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { discoverTopTrendingTopic, DiscoveredTopic } from '../services/trends';
import { generateBanglaPostBundle, BanglaPostBundle, ReelsScriptData } from '../services/ai';
import { auditAndReflectPost, CriticAuditResult } from '../services/critic';
import { generateCarouselSlides } from '../services/media';
import { publishMultiPhotoPost, addCommentToPost } from '../services/facebook';
import { savePost, saveJobLog, saveComment, saveReply, getAutomationSettings, updateSlotExecution } from '../services/db';
import { collectAllRecentMetrics } from '../services/analytics';

export interface AutonomousPostResult {
  success: boolean;
  topic: string;
  category?: string;
  source?: string;
  score?: number;
  content: string;
  postId?: string;
  slotId?: string;
  imageUrls?: string[];
  firstCommentId?: string;
  firstCommentText?: string;
  reelsScript?: ReelsScriptData;
  criticAudit?: {
    score: number;
    wasRevised: boolean;
    feedback: string;
  };
  error?: string;
  timestamp: string;
}

/**
 * Converts HH:mm (e.g., "09:30", "14:30", "20:30") to standard 5-part cron expression
 */
export function timeToCron(timeStr: string): string {
  const parts = (timeStr || '').trim().split(':');
  const rawHour = parseInt(parts[0], 10);
  const rawMinute = parseInt(parts[1], 10);
  const hour = Number.isNaN(rawHour) ? 9 : Math.max(0, Math.min(23, rawHour));
  const minute = Number.isNaN(rawMinute) ? 0 : Math.max(0, Math.min(59, rawMinute));
  return `${minute} ${hour} * * *`;
}

// Active scheduled cron tasks in memory
const activeSlotTasks: { [slotId: string]: ScheduledTask } = {};
let analyticsCronTask: ScheduledTask | null = null;

/**
 * Executes the complete autonomous publishing pipeline with:
 * 1. Autonomous Topic Discovery tailored to slot category (trends.ts)
 * 2. Fact-Checking & Web Grounded Caption + First Comment Bundle + Viral Reels Script (ai.ts)
 * 3. AI Self-Reflection & Critic Audit (critic.ts)
 * 4. Multi-Slide Branded Carousel Generation with Watermark & Cheatsheet (media.ts)
 * 5. Meta Graph API Multi-Photo Publishing (facebook.ts)
 * 6. Automated First Comment with Direct Tool Links (Reach Hack!)
 * 7. Database & Persistence Layer (db.ts)
 *
 * @param customTopic Optional topic override
 * @param dryRun If true, runs all AI generation & preview without posting to Facebook
 * @param slotId Optional slot identifier ('slot_1', 'slot_2', 'slot_3')
 * @param slotCategory Optional editorial category for the slot
 */
export async function triggerManualPost(
  customTopic?: string,
  dryRun: boolean = false,
  slotId?: string,
  slotCategory?: string
): Promise<AutonomousPostResult> {
  const timestamp = new Date().toISOString();
  let selectedTopicTitle = '';
  let topicCategory = slotCategory || 'AI Tools & Productivity';
  let topicSource = 'Product Hunt & Web';
  let topicScore = 90;

  console.log(`\n======================================================`);
  console.log(`[Autonomous Publisher] 🚀 Starting Facebook Pipeline ${slotId ? `for [${slotId}]` : ''} at ${timestamp}`);

  try {
    // 1. Topic Discovery with Self-Learning Feedback Loop & Multi-Source Intelligence
    if (customTopic && customTopic.trim().length > 0) {
      selectedTopicTitle = customTopic.trim();
      console.log(`[Autonomous Publisher] 🎯 Using Custom Topic Override: "${selectedTopicTitle}"`);
    } else {
      const discovered: DiscoveredTopic = await discoverTopTrendingTopic(slotCategory);
      selectedTopicTitle = discovered.title;
      topicCategory = discovered.category;
      topicSource = discovered.source || 'Product Hunt';
      topicScore = discovered.finalScore;
      console.log(`[Autonomous Publisher] 🧠 Selected Top Ranked Topic from [${topicSource}] (${topicCategory} | Score: ${topicScore}): "${selectedTopicTitle}"`);
    }

    // 2. Generate Fact-Checked Bengali Content, First-Comment Links & 30s Reels Script
    console.log(`[Autonomous Publisher] ✍️ Generating Bengali Caption, First-Comment Links & Viral Reels Script...`);
    const bundle: BanglaPostBundle = await generateBanglaPostBundle(selectedTopicTitle);

    // 3. AI Self-Reflection & Critic Audit (Accuracy, Flow, Hook, Value Rubric)
    console.log(`[Autonomous Publisher] 🧐 Running Critic Audit & Self-Reflection...`);
    const audit: CriticAuditResult = await auditAndReflectPost(bundle.caption, selectedTopicTitle);
    const finalCaption = audit.approvedPost;

    console.log(`[Autonomous Publisher] 🏆 Critic Evaluation: ${audit.overallScore}/100 (Revised: ${audit.wasRevised})`);

    // 4. Generate Multi-Slide Branded Visual Carousel (Cover + Infographic Cheatsheet + Summary)
    console.log(`[Autonomous Publisher] 🎨 Generating branded 3-slide visual tech carousel with ByteBangla watermark...`);
    const slides = await generateCarouselSlides(selectedTopicTitle);
    const imageUrls = slides.map((s) => s.imageUrl);

    // 5. If Dry-Run Mode is enabled, skip Facebook publishing
    if (dryRun) {
      console.log(`[Autonomous Publisher] 🧪 DRY RUN MODE ACTIVE: Skipping Facebook publishing.`);
      console.log(`[Autonomous Publisher] Preview ready: "${selectedTopicTitle}"`);
      console.log(`[Autonomous Publisher] Critic Score: ${audit.overallScore}/100`);

      return {
        success: true,
        topic: selectedTopicTitle,
        category: topicCategory,
        source: topicSource,
        score: topicScore,
        content: finalCaption,
        slotId,
        imageUrls,
        firstCommentText: bundle.firstComment,
        reelsScript: bundle.reelsScript,
        criticAudit: {
          score: audit.overallScore,
          wasRevised: audit.wasRevised,
          feedback: audit.feedback,
        },
        timestamp,
      };
    }

    // 6. Publish Multi-Photo Post to Facebook Page
    console.log(`[Autonomous Publisher] 📤 Uploading 3-slide Carousel Post to Meta Graph API...`);
    const fbRes = await publishMultiPhotoPost(imageUrls, finalCaption);

    // 7. First Comment Link Automation (Reach Hack - respect settings)
    const settings = getAutomationSettings();
    let firstCommentId: string | undefined;

    if (settings.autoFirstComment && bundle.firstComment && bundle.firstComment.trim().length > 0) {
      try {
        console.log(`[Autonomous Publisher] 📌 Posting First Comment with direct resource links...`);
        // Small delay to ensure post is indexed on Meta side
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const commentRes = await addCommentToPost(fbRes.post_id, bundle.firstComment);
        firstCommentId = commentRes.id;

        await saveComment({
          facebookCommentId: commentRes.id,
          postId: fbRes.post_id,
          senderName: 'ByteBangla (Page)',
          senderId: env.PAGE_ID,
          text: bundle.firstComment,
          classification: 'FIRST_COMMENT_LINKS',
          isFlagged: false,
        });
      } catch (commentErr: any) {
        console.warn(`[Autonomous Publisher Warning] First comment automation notice: ${commentErr.message}`);
      }
    }

    // 8. Persist to Database / Local store
    await savePost({
      facebookPostId: fbRes.post_id,
      caption: finalCaption,
      imageUrl: imageUrls[0],
      status: 'PUBLISHED',
    });

    if (slotId) {
      updateSlotExecution(slotId, 'SUCCESS', fbRes.post_id, selectedTopicTitle);
    }

    await saveJobLog(
      slotId ? `AUTONOMOUS_${slotId.toUpperCase()}` : 'AUTONOMOUS_PUBLISHER',
      'SUCCESS',
      `Post ID: ${fbRes.post_id}, Topic: ${selectedTopicTitle} [${topicSource}], Critic: ${audit.overallScore}/100, Carousel: ${imageUrls.length} slides, FirstComment: ${Boolean(firstCommentId)}`
    );

    console.log(`[Autonomous Publisher] 🌟 PIPELINE COMPLETED! Post ID: ${fbRes.post_id}`);
    console.log(`======================================================\n`);

    return {
      success: true,
      topic: selectedTopicTitle,
      category: topicCategory,
      source: topicSource,
      score: topicScore,
      content: finalCaption,
      postId: fbRes.post_id,
      slotId,
      imageUrls,
      firstCommentId,
      firstCommentText: bundle.firstComment,
      reelsScript: bundle.reelsScript,
      criticAudit: {
        score: audit.overallScore,
        wasRevised: audit.wasRevised,
        feedback: audit.feedback,
      },
      timestamp,
    };
  } catch (error: any) {
    console.error(`[Autonomous Publisher] ❌ Pipeline Execution Failed:`, error.message);
    if (slotId) {
      updateSlotExecution(slotId, 'FAILED', undefined, selectedTopicTitle);
    }
    await saveJobLog(slotId ? `AUTONOMOUS_${slotId.toUpperCase()}` : 'AUTONOMOUS_PUBLISHER', 'FAILED', error.message);

    return {
      success: false,
      topic: selectedTopicTitle || 'Unknown Topic',
      content: '',
      slotId,
      error: error.message || 'Pipeline failed',
      timestamp,
    };
  }
}

/**
 * Dynamically re-configures and reschedules all 3 daily posting cron jobs
 * based on the latest automation settings in data/settings.json
 */
export function rescheduleAllJobs(): { scheduledCount: number; autoPilot: boolean } {
  const settings = getAutomationSettings();

  // 1. Stop and remove all running slot tasks
  for (const slotId of Object.keys(activeSlotTasks)) {
    try {
      activeSlotTasks[slotId].stop();
      delete activeSlotTasks[slotId];
    } catch (e: any) {
      console.warn(`[Scheduler Warning] Could not stop previous task for ${slotId}: ${e.message}`);
    }
  }

  // 2. If Master Auto-Pilot is disabled, do not schedule
  if (!settings.autoPilotEnabled) {
    console.log('[Scheduler] ⏸️ Master Auto-Pilot is PAUSED. Daily 3-post cron jobs are inactive.');
    return { scheduledCount: 0, autoPilot: false };
  }

  // 3. Register each active slot
  let count = 0;
  for (const slot of settings.slots) {
    if (slot.enabled) {
      const cronExpr = timeToCron(slot.time);
      const slotRef = slot;

      activeSlotTasks[slot.id] = cron.schedule(
        cronExpr,
        async () => {
          const currentSettings = getAutomationSettings();
          const targetSlot = currentSettings.slots.find((s) => s.id === slotRef.id);

          if (!currentSettings.autoPilotEnabled) {
            console.log(`[Scheduler Trigger] Skipped ${slotRef.name} because Master Auto-Pilot is paused.`);
            return;
          }

          if (targetSlot && !targetSlot.enabled) {
            console.log(`[Scheduler Trigger] Skipped ${slotRef.name} because this slot is disabled.`);
            return;
          }

          console.log(`\n[Scheduler Trigger] ⏰ 100% Autonomous Post for [${slotRef.nameBn} - ${slotRef.time} BST] executing at ${new Date().toISOString()}...`);
          await triggerManualPost(undefined, false, slotRef.id, targetSlot?.category || slotRef.category);
        },
        {
          scheduled: true,
          timezone: settings.timezone || 'Asia/Dhaka',
        }
      );

      console.log(`[Scheduler] ⏰ Slot registered: [${slot.nameBn}] at ${slot.time} BST (cron: "${cronExpr}")`);
      count++;
    } else {
      console.log(`[Scheduler] ⚪ Slot skipped (Disabled by user): [${slot.nameBn}]`);
    }
  }

  console.log(`[Scheduler] ✅ Successfully initialized ${count} daily autonomous posting slots (Asia/Dhaka).`);
  return { scheduledCount: count, autoPilot: true };
}

/**
 * Returns the current live status of the scheduler
 */
export function getSchedulerStatus(): {
  autoPilotEnabled: boolean;
  activeSlotsCount: number;
  activeSlotIds: string[];
  timezone: string;
} {
  const settings = getAutomationSettings();
  return {
    autoPilotEnabled: settings.autoPilotEnabled,
    activeSlotsCount: Object.keys(activeSlotTasks).length,
    activeSlotIds: Object.keys(activeSlotTasks),
    timezone: settings.timezone || 'Asia/Dhaka',
  };
}

/**
 * Initializes the automated multi-slot cron schedule and nightly analytics
 */
export function initPublisherJob(): {
  activeSlotTasks: { [slotId: string]: ScheduledTask };
  analyticsTask: ScheduledTask;
  rescheduleAllJobs: typeof rescheduleAllJobs;
} {
  console.log(`[Scheduler] 🚀 Initializing ByteBangla 3-Slot Autonomous Scheduler (Asia/Dhaka)...`);
  rescheduleAllJobs();

  if (!analyticsCronTask) {
    analyticsCronTask = cron.schedule(
      '0 0 * * *',
      async () => {
        console.log(`\n[Scheduler Trigger] 📊 Collecting nightly post metrics at ${new Date().toISOString()}...`);
        await collectAllRecentMetrics();
      },
      {
        scheduled: true,
        timezone: 'Asia/Dhaka',
      }
    );
  }

  return {
    activeSlotTasks,
    analyticsTask: analyticsCronTask,
    rescheduleAllJobs,
  };
}

export function stopAllScheduledTasks(): void {
  for (const slotId of Object.keys(activeSlotTasks)) {
    try {
      activeSlotTasks[slotId].stop();
      delete activeSlotTasks[slotId];
    } catch (e: any) {
      // ignore
    }
  }
  if (analyticsCronTask) {
    try {
      analyticsCronTask.stop();
      analyticsCronTask = null;
    } catch (e: any) {
      // ignore
    }
  }
}

