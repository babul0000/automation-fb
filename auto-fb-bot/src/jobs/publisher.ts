import cron, { ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { discoverTopTrendingTopic, DiscoveredTopic } from '../services/trends';
import { generateBanglaPostBundle, BanglaPostBundle, ReelsScriptData } from '../services/ai';
import { auditAndReflectPost, auditReelsScript, CriticAuditResult } from '../services/critic';
import { generateCarouselSlides } from '../services/media';
import { generateReelVideo } from '../services/video';
import { publishMultiPhotoPost, publishReelToFacebookPage, addCommentToPost, pinCommentToPost } from '../services/facebook';
import { savePost, saveJobLog, saveComment, saveReply, getAutomationSettings, updateSlotExecution, getRecentPosts } from '../services/db';
import { collectAllRecentMetrics } from '../services/analytics';

/**
 * Enforces minimum 6-hour cooldown between automated publishing runs
 * to protect Facebook page algorithmic health from spam penalties.
 */
export async function isCooldownActive(minHours: number = 2): Promise<{ active: boolean; remainingMinutes: number }> {
  try {
    const recent = await getRecentPosts(1);
    if (!recent || recent.length === 0) return { active: false, remainingMinutes: 0 };
    const lastPost = recent[0];
    const lastTime = new Date(lastPost.publishedAt).getTime();
    if (isNaN(lastTime)) return { active: false, remainingMinutes: 0 };

    const diffHours = (Date.now() - lastTime) / (1000 * 60 * 60);
    if (diffHours < minHours) {
      const remainingMinutes = Math.round((minHours - diffHours) * 60);
      return { active: true, remainingMinutes };
    }
  } catch {
    // fallback gracefully
  }
  return { active: false, remainingMinutes: 0 };
}

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
  slotCategory?: string,
  bypassCooldown: boolean = true
): Promise<AutonomousPostResult> {
  const timestamp = new Date().toISOString();
  let selectedTopicTitle = '';
  let topicCategory = slotCategory || 'Smart Mobile & Life Hacks';
  let topicSource = 'Trend Intelligence & Web';
  let topicScore = 90;

  console.log(`\n======================================================`);
  console.log(`[Autonomous Publisher] 🚀 Starting Facebook Pipeline ${slotId ? `for [${slotId}]` : ''} at ${timestamp} (Manual/Bypass: ${bypassCooldown})`);

  try {
    // Enforce 2-hour Anti-Spam Rate Limit Cooldown ONLY for background scheduled automated runs
    if (!bypassCooldown && slotId && !dryRun && !customTopic) {
      const cooldown = await isCooldownActive(2);
      if (cooldown.active) {
        console.log(`[Autonomous Publisher] ⏳ Anti-Spam Rate Limit Active! Last post was less than 2 hours ago (${cooldown.remainingMinutes}m remaining). Skipping scheduled background run to protect Facebook Page algorithm.`);
        return {
          success: false,
          topic: 'Skipped: 2-Hour Anti-Spam Cooldown Active',
          content: '',
          slotId,
          error: `Cooldown active: ${cooldown.remainingMinutes} minutes remaining.`,
          timestamp,
        };
      }
    }

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

        // Auto-pin the first comment to spark community conversation
        await pinCommentToPost(fbRes.post_id, commentRes.id).catch(() => {});

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

export interface AutonomousReelResult {
  success: boolean;
  topic: string;
  category?: string;
  reelScript?: ReelsScriptData;
  criticScore?: number;
  postId?: string;
  slotId?: string;
  videoPath?: string;
  error?: string;
  timestamp: string;
}

/**
 * Strictly detects toolBrand and toolName from script, topic, hook, and body
 * to prevent topic mismatch (e.g. talking about CapCut/Canva but displaying VS Code/ChatGPT).
 */
export function detectStrictToolBrand(
  topic: string,
  hook: string,
  body: string,
  bundleToolBrand?: string
): { toolBrand: string; toolName: string } {
  const combined = `${topic} ${hook} ${body} ${bundleToolBrand || ''}`.toLowerCase();

  // 1. Check for the 5 Universal Mass-Market Pillars
  if (
    combined.includes('scam_alert_security') ||
    combined.includes('scam') ||
    combined.includes('প্রতারণা') ||
    combined.includes('বিকাশ') ||
    combined.includes('নগদ') ||
    combined.includes('এটিএম') ||
    combined.includes('হ্যাক') ||
    combined.includes('পাসওয়ার্ড') ||
    combined.includes('ফিশিং') ||
    combined.includes('নিরাপত্তা')
  ) {
    return { toolBrand: 'scam_alert_security', toolName: 'ডিজিটাল নিরাপত্তা ও স্ক্যাম অ্যালার্ট' };
  }

  if (
    combined.includes('inspiring_stories') ||
    combined.includes('কালাম') ||
    combined.includes('নজরুল') ||
    combined.includes('স্টিভ জবস') ||
    combined.includes('অনুপ্রেরণা') ||
    combined.includes('গল্প') ||
    combined.includes('ঘুরে দাঁড়ানো') ||
    combined.includes('সাফল্য')
  ) {
    return { toolBrand: 'inspiring_stories', toolName: 'জীবন বদলে দেওয়া বাস্তব গল্প' };
  }

  if (
    combined.includes('psychology_wisdom') ||
    combined.includes('মনস্তত্ত্ব') ||
    combined.includes('সাইকোলজি') ||
    combined.includes('বডি ল্যাঙ্গুয়েজ') ||
    combined.includes('মিথ্যা') ||
    combined.includes('রাগ') ||
    combined.includes('দুশ্চিন্তা') ||
    combined.includes('টাকা') ||
    combined.includes('অভ্যাস')
  ) {
    return { toolBrand: 'psychology_wisdom', toolName: 'হিউম্যান সাইকোলজি ও মানসিক শক্তি' };
  }

  if (
    combined.includes('curiosity_history_wonders') ||
    combined.includes('ইতিহাস') ||
    combined.includes('রহস্য') ||
    combined.includes('বাংলাদেশ') ||
    combined.includes('পিরামিড') ||
    combined.includes('মহাকাশ') ||
    combined.includes('ভৌগোলিক') ||
    combined.includes('বিজ্ঞান')
  ) {
    return { toolBrand: 'curiosity_history_wonders', toolName: 'অজানা ইতিহাস ও রোমাঞ্চকর তথ্য' };
  }

  if (
    combined.includes('smart_life_hacks') ||
    combined.includes('মেমোরি') ||
    combined.includes('স্টোরেজ') ||
    combined.includes('ক্যামেরা') ||
    combined.includes('অনুবাদ') ||
    combined.includes('ট্রেন') ||
    combined.includes('টিকিট') ||
    combined.includes('মোবাইল') ||
    combined.includes('ব্যাটারি')
  ) {
    return { toolBrand: 'smart_life_hacks', toolName: 'স্মার্ট মোবাইল ও লাইফ হ্যাকস' };
  }

  // 2. Check for Popular Everyday Consumer Tools
  if (combined.includes('capcut') || combined.includes('ক্যাপকাট')) {
    return { toolBrand: 'capcut', toolName: 'CapCut Video Editor' };
  }
  if (combined.includes('canva') || combined.includes('ক্যানভা')) {
    return { toolBrand: 'canva', toolName: 'Canva Design & Magic Studio' };
  }
  if (combined.includes('excel') || combined.includes('এক্সেল') || combined.includes('স্প্রেডশিট')) {
    return { toolBrand: 'excel', toolName: 'Microsoft Excel 365' };
  }
  if (combined.includes('photoshop') || combined.includes('ফটোশপ')) {
    return { toolBrand: 'photoshop', toolName: 'Adobe Photoshop' };
  }

  const brand = (bundleToolBrand || 'smart_life_hacks').toLowerCase();
  return { toolBrand: brand, toolName: 'স্মার্ট লাইফ হ্যাকস ও টিপস' };
}

/**
 * Executes the complete autonomous Facebook Reel publishing pipeline:
 * 1. Topic discovery tailored for viral short video (trends.ts)
 * 2. Fact-checked Bengali caption, 30s Reels Script & Voiceover (ai.ts)
 * 3. AI Self-Reflection & Critic Audit (critic.ts)
 * 4. MP4 video synthesis with Google TTS Bengali voiceover & 9:16 vertical 3D frames (video.ts)
 * 5. Meta Graph API Reel Publishing (facebook.ts)
 * 6. Automated First Comment with resource links
 * 7. Persistence to store and execution logs (db.ts)
 */
export async function triggerAutonomousReelPost(
  customTopic?: string,
  dryRun: boolean = false,
  slotId: string = 'slot_reel',
  slotCategory?: string,
  bypassCooldown: boolean = true
): Promise<AutonomousReelResult> {
  const timestamp = new Date().toISOString();
  let selectedTopicTitle = '';
  let topicCategory = slotCategory || 'Smart Mobile & Life Hacks';

  console.log(`\n======================================================`);
  console.log(`[Reel Publisher] 🎬 Starting Facebook Reel Pipeline for [${slotId}] at ${timestamp} (Manual/Bypass: ${bypassCooldown})`);

  try {
    // Enforce 2-hour Anti-Spam Rate Limit Cooldown ONLY for background scheduled automated runs
    if (!bypassCooldown && slotId && !dryRun && !customTopic) {
      const cooldown = await isCooldownActive(2);
      if (cooldown.active) {
        console.log(`[Reel Publisher] ⏳ Anti-Spam Rate Limit Active! Last post was less than 2 hours ago (${cooldown.remainingMinutes}m remaining). Skipping scheduled background run to protect Facebook Page algorithm.`);
        return {
          success: false,
          topic: 'Skipped: 2-Hour Anti-Spam Cooldown Active',
          slotId,
          error: `Cooldown active: ${cooldown.remainingMinutes} minutes remaining.`,
          timestamp,
        };
      }
    }

    // 1. Topic discovery tailored for viral short video
    if (customTopic && customTopic.trim().length > 0) {
      selectedTopicTitle = customTopic.trim();
      console.log(`[Reel Publisher] 🎯 Custom Topic Override: "${selectedTopicTitle}"`);
    } else {
      const discovered = await discoverTopTrendingTopic(topicCategory);
      selectedTopicTitle = discovered.title;
      topicCategory = discovered.category;
      console.log(`[Reel Publisher] 🧠 Selected Reel Topic: "${selectedTopicTitle}"`);
    }

    // 2. Generate Bengali Post Bundle with Reels Script
    console.log(`[Reel Publisher] ✍️ Generating Bengali 30s Reel script & voiceover lines...`);
    let bundle: BanglaPostBundle = await generateBanglaPostBundle(selectedTopicTitle);

    if (!bundle.reelsScript) {
      throw new Error('AI did not return reelsScript for Reel generation.');
    }

    // 3. Strict Critic Audit for Concrete Reels Script
    console.log(`[Reel Publisher] 🧐 Auditing Reel script with strict concrete specificity validation...`);
    let audit: CriticAuditResult = await auditReelsScript(bundle.reelsScript, selectedTopicTitle);
    console.log(`[Reel Publisher] 🏆 Critic Evaluation: ${audit.overallScore}/100`);

    // If script is generic (Score 0), force re-generation with a concrete trending topic
    if (audit.overallScore === 0) {
      console.warn(`[Reel Publisher] ❌ Critic rejected generic script with Score 0!`);
      console.warn(`[Reel Publisher] 🚫 Reason: ${audit.feedback}`);
      console.log(`[Reel Publisher] 🔄 Forcing re-generation with a concrete trending topic...`);

      const concreteCategories: string[] = [
        'smart_life_hacks',
        'scam_alert_security',
        'inspiring_stories',
        'psychology_wisdom',
        'curiosity_history_wonders',
      ];
      let regenerationSucceeded = false;

      for (let attempt = 1; attempt <= 3; attempt++) {
        const retryCategory = concreteCategories[attempt % concreteCategories.length];
        console.log(`[Reel Publisher] 🔍 Discovering fresh concrete topic across 5 pillars (Attempt ${attempt}/3, Category: ${retryCategory})...`);
        const freshTopic = await discoverTopTrendingTopic(retryCategory);
        selectedTopicTitle = freshTopic.title;
        topicCategory = freshTopic.category;

        console.log(`[Reel Publisher] ✍️ Re-generating bundle for concrete topic: "${selectedTopicTitle}"...`);
        bundle = await generateBanglaPostBundle(selectedTopicTitle);

        if (bundle.reelsScript) {
          audit = await auditReelsScript(bundle.reelsScript, selectedTopicTitle);
          console.log(`[Reel Publisher] 🏆 Critic Evaluation on attempt ${attempt}: ${audit.overallScore}/100`);
          if (audit.overallScore > 0) {
            regenerationSucceeded = true;
            console.log(`[Reel Publisher] ✅ Concrete script successfully approved by Critic!`);
            break;
          }
        }
      }

      if (!regenerationSucceeded || audit.overallScore === 0) {
        throw new Error(`Reel generation aborted: Script remained generic and failed Critic validation (Score: 0).`);
      }
    }

    if (!bundle.reelsScript) {
      throw new Error('AI did not return reelsScript for Reel generation.');
    }
    const finalReelsScript = bundle.reelsScript;

    // If critic approved an improved version of the script, use it
    if (audit.approvedPost && audit.wasRevised) {
      finalReelsScript.fullScript = audit.approvedPost;
    }

    // Strict tool brand detection to guarantee topic-visual consistency
    const strictBrand = detectStrictToolBrand(
      selectedTopicTitle,
      finalReelsScript.hook,
      finalReelsScript.body,
      bundle.toolBrand
    );
    console.log(`[Reel Publisher] 🎯 Strict Tool Brand Resolved: "${strictBrand.toolBrand}" (${strictBrand.toolName})`);

    // 4. Generate MP4 Video with Voiceover & Vertical Visual Frames
    console.log(`[Reel Publisher] 🎥 Synthesizing 9:16 MP4 video Reel...`);
    const generatedReel = await generateReelVideo({
      topic: selectedTopicTitle,
      headlineEn: finalReelsScript.headlineEn,
      hookText: finalReelsScript.hook,
      bodyText: finalReelsScript.body,
      ctaText: finalReelsScript.cta,
      fullScript: finalReelsScript.fullScript,
      imagePrompts: bundle.reelsVisualPrompts,
      phase1Hook: finalReelsScript.phase1Hook || finalReelsScript.hook,
      phase2Solution: finalReelsScript.phase2Solution,
      phase3Steps: finalReelsScript.phase3Steps,
      phase4Cta: finalReelsScript.phase4Cta || finalReelsScript.cta,
      toolBrand: strictBrand.toolBrand,
      toolName: strictBrand.toolName,
      practicalSnippet: bundle.practicalSnippet,
      snippetType: bundle.snippetType,
      targetAudience: bundle.targetAudience || finalReelsScript.targetAudience,
      pillarCategory: finalReelsScript.pillarCategory || bundle.pillarCategory,
      twoWordHook: finalReelsScript.twoWordHook || bundle.twoWordHook,
      actionKeycap: finalReelsScript.actionKeycap || bundle.actionKeycap,
      actionLabel: finalReelsScript.actionLabel || bundle.actionLabel,
      voice: 'bn-BD-PradeepNeural',
    });

    if (dryRun) {
      console.log(`[Reel Publisher] 🧪 DRY RUN: Generated Reel successfully at ${generatedReel.videoPath}`);
      return {
        success: true,
        topic: selectedTopicTitle,
        category: topicCategory,
        reelScript: finalReelsScript,
        criticScore: audit.overallScore,
        slotId,
        videoPath: generatedReel.videoPath,
        timestamp,
      };
    }

    // 5. Upload & Publish Reel to Meta Graph API (with High-Impact Hook Cover Thumbnail)
    console.log(`[Reel Publisher] 🚀 Uploading Reel to Facebook Page via Meta Graph API...`);
    const caption = `${finalReelsScript.hook}\n\n${finalReelsScript.body}\n\n👉 ${finalReelsScript.cta}\n\n#ByteBangla #LifeHacks #BanglaTips #Bangladesh #ViralReels #ReelsBD`;
    const reelRes = await publishReelToFacebookPage(
      generatedReel.videoBuffer,
      caption,
      generatedReel.coverThumbnailBuffer || generatedReel.coverThumbnailPath
    );

    // Clean up temporary files
    generatedReel.cleanup();

    // 6. First comment link automation if configured
    const settings = getAutomationSettings();
    if (settings.autoFirstComment && bundle.firstComment) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const cRes = await addCommentToPost(reelRes.video_id, bundle.firstComment);
        if (cRes?.id) {
          // Auto-pin the first comment to spark community conversation
          await pinCommentToPost(reelRes.video_id, cRes.id).catch(() => {});
        }
      } catch (cErr: any) {
        console.warn(`[Reel Publisher Warning] Reel first comment notice: ${cErr.message}`);
      }
    }

    // 7. Persist to DB
    await savePost({
      facebookPostId: reelRes.video_id,
      caption,
      status: 'PUBLISHED_REEL',
    });

    updateSlotExecution(slotId, 'SUCCESS', reelRes.video_id, selectedTopicTitle);

    await saveJobLog(
      'AUTONOMOUS_REEL_PUBLISHER',
      'SUCCESS',
      `Reel ID: ${reelRes.video_id}, Topic: ${selectedTopicTitle}, Critic: ${audit.overallScore}/100, Duration: ${generatedReel.durationSeconds}s`
    );

    console.log(`[Reel Publisher] 🌟 REEL PIPELINE COMPLETED! Video ID: ${reelRes.video_id}`);
    console.log(`======================================================\n`);

    return {
      success: true,
      topic: selectedTopicTitle,
      category: topicCategory,
      reelScript: bundle.reelsScript,
      criticScore: audit.overallScore,
      postId: reelRes.video_id,
      slotId,
      timestamp,
    };
  } catch (error: any) {
    console.error(`[Reel Publisher] ❌ Reel Pipeline Execution Failed:`, error.message);
    updateSlotExecution(slotId, 'FAILED', undefined, selectedTopicTitle);
    await saveJobLog('AUTONOMOUS_REEL_PUBLISHER', 'FAILED', error.message);

    return {
      success: false,
      topic: selectedTopicTitle || 'Unknown Topic',
      slotId,
      error: error.message || 'Reel pipeline failed',
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

          if (slotRef.type === 'REEL' || slotRef.id === 'slot_reel') {
            console.log(`\n[Scheduler Trigger] 🎬 100% Autonomous REEL for [${slotRef.nameBn} - ${slotRef.time} BST] executing at ${new Date().toISOString()}...`);
            await triggerAutonomousReelPost(undefined, false, slotRef.id, targetSlot?.category || slotRef.category, false);
          } else {
            console.log(`\n[Scheduler Trigger] ⏰ 100% Autonomous POST for [${slotRef.nameBn} - ${slotRef.time} BST] executing at ${new Date().toISOString()}...`);
            await triggerManualPost(undefined, false, slotRef.id, targetSlot?.category || slotRef.category, false);
          }
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

