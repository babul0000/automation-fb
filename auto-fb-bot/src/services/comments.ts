import axios from 'axios';
import { env, isConfiguredForGemini, isConfiguredForFacebook } from '../config/env';
import { replyToComment, sendPrivateReplyToComment } from './facebook';
import { saveComment, saveReply, findPostByFacebookId } from './db';

export interface IncomingCommentData {
  commentId: string;
  message: string;
  postId?: string;
  senderId?: string;
  senderName?: string;
}

export type CommentCategory =
  | 'QUESTION'
  | 'SOURCE_REQUEST'
  | 'LEAD_MAGNET'
  | 'POSITIVE'
  | 'SENSITIVE'
  | 'ABUSIVE'
  | 'NORMAL';

export interface CommentAnalysisResult {
  category: CommentCategory;
  shouldReply: boolean;
  replyText?: string;
  privateMessage?: string;
  isFlagged: boolean;
}

// Memory debounce set to avoid duplicate processing
const processedComments = new Set<string>();

/**
 * Checks if a comment matches common lead-magnet keyword triggers
 */
function isLeadMagnetKeyword(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  const triggers = ['ai', 'prompt', 'link', 'tool', 'টুল', 'চাই', 'শিট', 'গাইড', 'pdf', 'পাঠান', 'need'];
  return triggers.some((t) => normalized === t || normalized.startsWith(`${t} `) || normalized.includes(t));
}

/**
 * Fetches parent post text either from database or Meta Graph API fallback
 */
async function getParentPostContext(postId?: string): Promise<string> {
  if (!postId) return '';

  try {
    const dbPost = await findPostByFacebookId(postId);
    if (dbPost && dbPost.caption) {
      console.log(`[Comment Intelligence] 📖 Retrieved parent post context from database (${dbPost.caption.length} chars).`);
      return dbPost.caption;
    }

    if (isConfiguredForFacebook()) {
      const url = `https://graph.facebook.com/v21.0/${postId}`;
      const res = await axios.get(url, {
        params: {
          fields: 'message,caption,description',
          access_token: env.PAGE_ACCESS_TOKEN,
        },
        timeout: 10000,
      });

      const message = res.data?.message || res.data?.caption || res.data?.description || '';
      if (message) {
        console.log(`[Comment Intelligence] 📡 Retrieved parent post context from Graph API (${message.length} chars).`);
        return message;
      }
    }
  } catch (err: any) {
    console.warn(`[Comment Intelligence Warning] Could not fetch parent post context: ${err.message}`);
  }

  return '';
}

/**
 * Classifies an incoming comment and generates a deeply context-aware response using Gemini
 */
export async function analyzeCommentWithAI(
  commentText: string,
  senderName?: string,
  postContext?: string
): Promise<CommentAnalysisResult> {
  const cleanName = senderName || 'ভাই';

  // 1. Instant Lead Magnet Keyword Trigger
  if (isLeadMagnetKeyword(commentText)) {
    console.log(`[Comment Intelligence] 🎯 Lead Magnet Keyword Trigger matched in comment: "${commentText}"`);
    return {
      category: 'LEAD_MAGNET',
      shouldReply: true,
      replyText: `ধন্যবাদ ${cleanName}! আপনার অনুরোধ অনুযায়ী প্রয়োজনীয় রিসোর্স ও ডিরেক্ট লিংক আপনার মেসেঞ্জার ইনবক্সে পাঠিয়ে দেওয়া হয়েছে 🚀 চেক করে নিন!`,
      privateMessage: `হ্যালো ${cleanName}! বাইট বাংলার সাথে থাকার জন্য ধন্যবাদ। পোস্টে উল্লেখিত টুলস ও প্রম্পটের ডিরেক্ট লিংকসমূহ:\n\n১. ChatGPT: https://chatgpt.com\n২. Claude AI: https://claude.ai\n৩. Perplexity AI: https://perplexity.ai\n\n📌 পেজটি ফলো করে রাখুন এমন নিয়মিত টেক টিপস পেতে! 💙`,
      isFlagged: false,
    };
  }

  if (!isConfiguredForGemini()) {
    return {
      category: 'POSITIVE',
      shouldReply: true,
      replyText: `অনেক ধন্যবাদ ${cleanName} সাথে থাকার জন্য! ❤️ বাইট বাংলার সাথে থাকুন আরও দারুণ টেক টিপসের জন্য।`,
      isFlagged: false,
    };
  }

  const contextBlock = postContext && postContext.trim().length > 0
    ? `PARENT FACEBOOK POST CONTEXT (You authored this post):
"""
${postContext.trim()}
"""`
    : `PARENT POST CONTEXT: Practical AI and digital productivity tips in Bengali.`;

  const prompt = `You are the friendly, helpful social media community manager for "ByteBangla" (সহজ বাংলায় এআই ও টেকনোলজি টিপস).

${contextBlock}

A Facebook user ('${cleanName}') commented on our post:
USER COMMENT: "${commentText}"

YOUR GOAL:
Step 1: Classify the comment into EXACTLY ONE category:
- "QUESTION": User asking how to use a tool, solve a problem, or asking for help.
- "SOURCE_REQUEST": User asking where to find the tool, link, or source.
- "POSITIVE": Praise, appreciation, compliment, or friendly remark.
- "NORMAL": General casual remark.
- "SENSITIVE": Politics, religious controversy, legal disputes, privacy, or dangerous claims.
- "ABUSIVE": Hate speech, offensive insults, vulgarity.

Step 2:
- If category is "SENSITIVE" or "ABUSIVE", do NOT generate any reply (shouldReply: false).
- If category is "QUESTION" or "SOURCE_REQUEST", answer their specific query DIRECTLY based on the tools and instructions explained in the PARENT POST above!
- If category is "POSITIVE" or "NORMAL", provide a warm, courteous Bengali appreciation.
- Address the user politely (যেমন: "ধন্যবাদ ${cleanName}").
- Keep the reply concise (1-2 sentences maximum), natural, and in polite standard Bengali.

Return ONLY valid JSON without backticks:
{
  "category": "QUESTION" | "SOURCE_REQUEST" | "POSITIVE" | "NORMAL" | "SENSITIVE" | "ABUSIVE",
  "shouldReply": true | false,
  "replyText": "আপনার বাংলা উত্তর",
  "isFlagged": true | false
}`;

  const modelsToTry = [
    process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
  ];

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const response = await axios.post(
        endpoint,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (raw) {
        const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
          category: parsed.category || 'NORMAL',
          shouldReply: Boolean(parsed.shouldReply),
          replyText: parsed.replyText || '',
          isFlagged: Boolean(parsed.isFlagged) || parsed.category === 'SENSITIVE' || parsed.category === 'ABUSIVE',
        };
      }
    } catch (err: any) {
      console.warn(`[Comment Service Warning] AI classification model ${model} failed: ${err.message}. Trying next...`);
    }
  }

  // Fallback safe heuristic
  const isQuestion = commentText.includes('?') || commentText.includes('কিভাবে') || commentText.includes('কোথায়');
  return {
    category: isQuestion ? 'QUESTION' : 'POSITIVE',
    shouldReply: true,
    replyText: `অনেক ধন্যবাদ ${cleanName} সাথে থাকার জন্য! ❤️ যেকোনো তথ্যের জন্য বাইট বাংলার পেজে চোখ রাখুন।`,
    isFlagged: false,
  };
}

/**
 * Handles incoming Facebook comment event with safety checks and contextual auto-reply
 */
export async function processIncomingComment(data: IncomingCommentData): Promise<void> {
  const { commentId, message, postId, senderId, senderName } = data;

  if (!commentId || !message || message.trim().length === 0) {
    return;
  }

  // 1. CRITICAL LOOP PREVENTION: Never reply to comments made by the Page itself
  if (senderId === env.PAGE_ID || senderName?.toLowerCase().includes('bytebangla')) {
    console.log(`[Comment Service] 🛑 Ignoring self-comment from Page (${senderId || 'ByteBangla'}). Loop prevented.`);
    return;
  }

  // 2. Debounce check: Prevent duplicate processing of the same comment event
  if (processedComments.has(commentId)) {
    console.log(`[Comment Service] ⏭️ Comment ${commentId} already processed. Skipping.`);
    return;
  }
  processedComments.add(commentId);

  // Keep debounce set bounded
  if (processedComments.size > 1000) {
    const first = processedComments.values().next().value;
    if (first) processedComments.delete(first);
  }

  console.log(`\n======================================================`);
  console.log(`[Comment Service] 💬 Incoming Comment Received:`);
  console.log(`From: "${senderName || 'Anonymous'}" (ID: ${senderId || 'N/A'})`);
  console.log(`Text: "${message}"`);
  console.log(`Post ID: ${postId || 'Unknown'}`);
  console.log(`======================================================`);

  try {
    // 3. Deep Context Retrieval: Fetch Parent Post
    const postContext = await getParentPostContext(postId);

    // 4. AI Intent Classification & Deep Context-Aware Response Generation
    const analysis = await analyzeCommentWithAI(message, senderName, postContext);
    console.log(`[Comment Service] 🏷️ Category: ${analysis.category}, ShouldReply: ${analysis.shouldReply}, Flagged: ${analysis.isFlagged}`);

    // 5. Save comment to Database / Local store
    await saveComment({
      facebookCommentId: commentId,
      postId,
      senderName,
      senderId,
      text: message,
      classification: analysis.category,
      isFlagged: analysis.isFlagged,
    });

    // 6. Comment-to-DM Private Reply if Lead Magnet Trigger
    if (analysis.privateMessage) {
      console.log(`[Comment Service] 📩 Sending private Messenger resource to user...`);
      await sendPrivateReplyToComment(commentId, analysis.privateMessage);
    }

    // 7. If safe and approved, send public reply via Meta Graph API
    if (analysis.shouldReply && analysis.replyText && analysis.replyText.trim().length > 0) {
      console.log(`[Comment Service] 🤖 Sending Contextual AI Reply: "${analysis.replyText}"`);
      const replyRes = await replyToComment(commentId, analysis.replyText);

      await saveReply({
        commentId,
        replyText: analysis.replyText,
        facebookReplyId: replyRes.id,
        status: 'SENT',
      });
      console.log(`[Comment Service] ✅ Reply published successfully to Facebook.`);
    } else if (analysis.isFlagged) {
      console.log(`[Comment Service] ⚠️ Comment flagged as ${analysis.category}. Auto-reply blocked for human review.`);
    }
  } catch (error: any) {
    console.error(`[Comment Service Error] Failed to handle comment ${commentId}:`, error.message);
  }
}
