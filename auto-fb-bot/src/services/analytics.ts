import axios from 'axios';
import { env, isConfiguredForFacebook } from '../config/env';
import { getRecentPosts } from './db';

export interface PostMetricData {
  postId: string;
  reactionsCount: number;
  commentsCount: number;
  sharesCount: number;
  capturedAt: string;
}

/**
 * Fetches real-time reactions, comments, and shares count for a Facebook post
 */
export async function fetchPostMetrics(postId: string): Promise<PostMetricData | null> {
  if (!isConfiguredForFacebook()) return null;

  try {
    const url = `https://graph.facebook.com/v21.0/${postId}`;
    const response = await axios.get(url, {
      params: {
        fields: 'id,reactions.summary(true),comments.summary(true),shares',
        access_token: env.PAGE_ACCESS_TOKEN,
      },
      timeout: 15000,
    });

    const data = response.data;
    const reactionsCount = data.reactions?.summary?.total_count || 0;
    const commentsCount = data.comments?.summary?.total_count || 0;
    const sharesCount = data.shares?.count || 0;

    return {
      postId,
      reactionsCount,
      commentsCount,
      sharesCount,
      capturedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    console.warn(`[Analytics Warning] Could not fetch metrics for post ${postId}: ${err.message}`);
    return null;
  }
}

/**
 * Collects metrics for all recent published posts
 */
export async function collectAllRecentMetrics(): Promise<PostMetricData[]> {
  console.log('[Analytics Engine] 📊 Collecting performance metrics for recent posts...');
  const recentPosts = await getRecentPosts(10);
  const results: PostMetricData[] = [];

  for (const post of recentPosts) {
    if (post.facebookPostId) {
      const metric = await fetchPostMetrics(post.facebookPostId);
      if (metric) {
        results.push(metric);
      }
    }
  }

  console.log(`[Analytics Engine] ✅ Collected metrics for ${results.length} posts.`);
  return results;
}
