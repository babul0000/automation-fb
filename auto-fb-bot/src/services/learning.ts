import { getAllPosts, PostRecord } from './db';
import { fetchPostMetrics } from './analytics';

export interface PostPerformance {
  post: PostRecord;
  topicTitle: string;
  reactions: number;
  comments: number;
  shares: number;
  score: number;
}

export interface LearningInsights {
  topPosts: PostPerformance[];
  lowPosts: PostPerformance[];
  feedbackSummary: string;
}

/**
 * Extracts a concise topic title or hook from the post caption
 */
function extractTitleFromCaption(caption: string): string {
  const firstLine = caption.split('\n')[0].replace(/[#*]/g, '').trim();
  return firstLine.length > 80 ? `${firstLine.substring(0, 80)}...` : firstLine;
}

/**
 * Evaluates performance metrics of historical posts and identifies high vs low engagement patterns
 */
export async function analyzeAudienceEngagement(): Promise<LearningInsights> {
  const posts = await getAllPosts();

  if (posts.length === 0) {
    return {
      topPosts: [],
      lowPosts: [],
      feedbackSummary: 'No historical post metrics available yet. Using baseline audience preference model.',
    };
  }

  const performanceList: PostPerformance[] = [];

  // Query live or cached metrics for up to the 10 most recent posts
  for (const post of posts.slice(0, 10)) {
    const metrics = await fetchPostMetrics(post.facebookPostId);
    const reactions = metrics?.reactionsCount || 0;
    const comments = metrics?.commentsCount || 0;
    const shares = metrics?.sharesCount || 0;

    // Engagement scoring formula: Shares (3x) + Comments (2x) + Reactions (1x)
    const score = reactions + comments * 2 + shares * 3;

    performanceList.push({
      post,
      topicTitle: extractTitleFromCaption(post.caption),
      reactions,
      comments,
      shares,
      score,
    });
  }

  // Sort by engagement score descending
  performanceList.sort((a, b) => b.score - a.score);

  const topPosts = performanceList.slice(0, 5);
  const lowPosts = performanceList.length > 5 ? performanceList.slice(-3) : [];

  let summary = 'Historical Audience Preferences:\n';
  if (topPosts.length > 0) {
    summary += 'Top Performing Angles:\n' + topPosts.map((p) => `- "${p.topicTitle}" (Score: ${p.score})`).join('\n') + '\n';
  }
  if (lowPosts.length > 0) {
    summary += 'Lower Performing Angles:\n' + lowPosts.map((p) => `- "${p.topicTitle}" (Score: ${p.score})`).join('\n');
  }

  return {
    topPosts,
    lowPosts,
    feedbackSummary: summary,
  };
}

/**
 * Generates an active learning context prompt to be fed into the Trend & Topic Discovery engine
 */
export async function getLearningFeedbackPrompt(): Promise<string> {
  const insights = await analyzeAudienceEngagement();

  if (insights.topPosts.length === 0) {
    return `AUDIENCE BASELINE PRIORITIES:
- Target Audience: Bengali students, freelancers, software developers, and remote workers.
- High-Converting Themes: Actionable ChatGPT & Claude prompts, free AI alternatives, Excel/Google Sheets automation, and desktop shortcuts.
- Preferred Style: Step-by-step practical advice with instant utility.`;
  }

  let prompt = `======================================================
AUDIENCE ENGAGEMENT MEMORY & CONTINUOUS LEARNING:
======================================================
Our past Facebook posts performed with the following audience response:

TOP PERFORMING TOPICS (HIGH ENGAGEMENT & SHARES):
${insights.topPosts.map((p, i) => `${i + 1}. "${p.topicTitle}" (Engagement: ${p.score})`).join('\n')}
`;

  if (insights.lowPosts.length > 0) {
    prompt += `
LOWER PERFORMING TOPICS (LESS RETENTION):
${insights.lowPosts.map((p, i) => `${i + 1}. "${p.topicTitle}" (Engagement: ${p.score})`).join('\n')}
`;
  }

  prompt += `
LEARNING ADAPTATION INSTRUCTIONS:
1. Double down on patterns found in the TOP PERFORMING TOPICS (e.g. specific tool comparisons, ready-to-copy prompts, free daily hacks).
2. Avoid generic, vague, or overly theoretical concepts that match the lower-performing angles.
3. Optimize candidate topics for high shareability and direct practical problem-solving.`;

  return prompt;
}
