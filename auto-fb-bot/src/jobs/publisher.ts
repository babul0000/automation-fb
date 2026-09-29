import cron, { ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { discoverTopTrendingTopic, DiscoveredTopic } from '../services/trends';
import { generateBanglaPostBundle, BanglaPostBundle } from '../services/ai';
import { auditAndReflectPost, CriticAuditResult } from '../services/critic';
import { generateCarouselSlides } from '../services/media';
import { publishMultiPhotoPost, addCommentToPost } from '../services/facebook';
import { savePost, saveJobLog, saveComment, saveReply } from '../services/db';
import { collectAllRecentMetrics } from '../services/analytics';

export interface AutonomousPostResult {
  success: boolean;
  topic: string;
  category?: string;
  score?: number;
  content: string;
  postId?: string;
  imageUrls?: string[];
  firstCommentId?: string;
  firstCommentText?: string;
  criticAudit?: {
    score: number;
    wasRevised: boolean;
    feedback: string;
  };
  error?: string;
  timestamp: string;
}

/**
 * Executes the complete autonomous publishing pipeline with:
 * 1. Autonomous Topic Discovery with Learning Feedback Loop (trends.ts + learning.ts)
 * 2. Fact-Checking & Web Grounded Caption + First Comment Bundle (ai.ts)
 * 3. AI Self-Reflection & Critic Audit (critic.ts)
 * 4. Multi-Slide Carousel Generation (media.ts)
 * 5. Meta Graph API Multi-Photo Publishing (facebook.ts)
 * 6. Automated First Comment with Direct Tool Links (Reach Hack!)
 * 7. Database & Persistence Layer (db.ts)
 *
 * @param customTopic Optional topic override
 */
export async function triggerManualPost(
  customTopic?: string,
  dryRun: boolean = false
): Promise<AutonomousPostResult> {
  const timestamp = new Date().toISOString();
  let selectedTopicTitle = '';
  let topicCategory = 'AI Tools & Productivity';
  let topicScore = 90;

  console.log(`\n======================================================`);
  console.log(`[Autonomous Publisher] 🚀 Starting Facebook Pipeline at ${timestamp}`);

  try {
    // 1. Topic Discovery with Self-Learning Feedback Loop
    if (customTopic && customTopic.trim().length > 0) {
      selectedTopicTitle = customTopic.trim();
      console.log(`[Autonomous Publisher] 🎯 Using Custom Topic Override: "${selectedTopicTitle}"`);
    } else {
      const discovered: DiscoveredTopic = await discoverTopTrendingTopic();
      selectedTopicTitle = discovered.title;
      topicCategory = discovered.category;
      topicScore = discovered.finalScore;
      console.log(`[Autonomous Publisher] 🧠 Selected Top Ranked Topic (${topicCategory} | Score: ${topicScore}): "${selectedTopicTitle}"`);
    }

    // 2. Generate Fact-Checked Bengali Content & First Comment Bundle
    console.log(`[Autonomous Publisher] ✍️ Generating Bengali Caption & First-Comment Links Bundle...`);
    const bundle: BanglaPostBundle = await generateBanglaPostBundle(selectedTopicTitle);

    // 3. AI Self-Reflection & Critic Audit (Accuracy, Flow, Hook, Value Rubric)
    console.log(`[Autonomous Publisher] 🧐 Running Critic Audit & Self-Reflection...`);
    const audit: CriticAuditResult = await auditAndReflectPost(bundle.caption, selectedTopicTitle);
    const finalCaption = audit.approvedPost;

    console.log(`[Autonomous Publisher] 🏆 Critic Evaluation: ${audit.overallScore}/100 (Revised: ${audit.wasRevised})`);

    // 4. Generate Multi-Slide Visual Carousel (Cover + Infographic Workflow)
    console.log(`[Autonomous Publisher] 🎨 Generating 2-slide visual tech carousel...`);
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
        score: topicScore,
        content: finalCaption,
        imageUrls,
        firstCommentText: bundle.firstComment,
        criticAudit: {
          score: audit.overallScore,
          wasRevised: audit.wasRevised,
          feedback: audit.feedback,
        },
        timestamp,
      };
    }

    // 5. Publish Multi-Photo Post to Facebook Page
    console.log(`[Autonomous Publisher] 📤 Uploading Carousel Post to Meta Graph API...`);
    const fbRes = await publishMultiPhotoPost(imageUrls, finalCaption);

    // 6. First Comment Link Automation (Reach Hack)
    let firstCommentId: string | undefined;
    if (bundle.firstComment && bundle.firstComment.trim().length > 0) {
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

    // 7. Persist to Database / Local store
    await savePost({
      facebookPostId: fbRes.post_id,
      caption: finalCaption,
      imageUrl: imageUrls[0],
      status: 'PUBLISHED',
    });

    await saveJobLog(
      'AUTONOMOUS_PUBLISHER',
      'SUCCESS',
      `Post ID: ${fbRes.post_id}, Topic: ${selectedTopicTitle}, Critic: ${audit.overallScore}/100, Carousel: ${imageUrls.length} slides, FirstComment: ${Boolean(firstCommentId)}`
    );

    console.log(`[Autonomous Publisher] 🌟 PIPELINE COMPLETED! Post ID: ${fbRes.post_id}`);
    console.log(`======================================================\n`);

    return {
      success: true,
      topic: selectedTopicTitle,
      category: topicCategory,
      score: topicScore,
      content: finalCaption,
      postId: fbRes.post_id,
      imageUrls,
      firstCommentId,
      firstCommentText: bundle.firstComment,
      criticAudit: {
        score: audit.overallScore,
        wasRevised: audit.wasRevised,
        feedback: audit.feedback,
      },
      timestamp,
    };
  } catch (error: any) {
    console.error(`[Autonomous Publisher] ❌ Pipeline Execution Failed:`, error.message);
    await saveJobLog('AUTONOMOUS_PUBLISHER', 'FAILED', error.message);

    return {
      success: false,
      topic: selectedTopicTitle || 'Unknown Topic',
      content: '',
      error: error.message || 'Pipeline failed',
      timestamp,
    };
  }
}

/**
 * Initializes the automated cron schedule for posting and nightly analytics
 */
export function initPublisherJob(): { publisherTask: ScheduledTask; analyticsTask: ScheduledTask } {
  const cronExpression = env.CRON_SCHEDULE || '30 9 * * *';

  console.log(`[Scheduler] ⏰ ByteBangla Autonomous Publisher scheduled with expression: "${cronExpression}" (Asia/Dhaka)`);

  const publisherTask = cron.schedule(
    cronExpression,
    async () => {
      console.log(`\n[Scheduler Trigger] ⏰ Scheduled autonomous post executing at ${new Date().toISOString()}...`);
      await triggerManualPost();
    },
    {
      scheduled: true,
      timezone: 'Asia/Dhaka',
    }
  );

  const analyticsTask = cron.schedule(
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

  return { publisherTask, analyticsTask };
}
