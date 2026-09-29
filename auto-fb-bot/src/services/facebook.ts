import axios from 'axios';
import { env, isConfiguredForFacebook } from '../config/env';

export interface FacebookPublishResponse {
  id: string;
  post_id?: string;
}

export interface MetaApiErrorData {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

/**
 * Publishes a text message to the configured Facebook Page feed using Meta Graph API v21.0.
 */
export async function publishToFacebookPage(message: string): Promise<FacebookPublishResponse> {
  if (!isConfiguredForFacebook()) {
    throw new Error('Facebook credentials are missing. Update your .env file.');
  }

  const endpoint = `https://graph.facebook.com/v21.0/${env.PAGE_ID}/feed`;
  console.log(`[Facebook Service] 📤 Publishing feed post to Page ID (${env.PAGE_ID})...`);

  try {
    const response = await axios.post<FacebookPublishResponse>(
      endpoint,
      { message: message.trim() },
      {
        params: { access_token: env.PAGE_ACCESS_TOKEN },
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );

    if (response.data && response.data.id) {
      console.log(`[Facebook Service] ✅ Feed post published successfully! Post ID: ${response.data.id}`);
      return { id: response.data.id, post_id: response.data.id };
    }

    throw new Error('Meta Graph API response did not contain a valid post ID.');
  } catch (error: any) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    console.error('[Facebook Service Error] Feed publishing failed:', errorMsg);
    throw new Error(`Facebook Feed Publishing failed: ${errorMsg}`);
  }
}

/**
 * Publishes a photo post with caption to the Facebook Page using Meta Graph API v21.0.
 * Falls back to standard feed post if photo upload encounters an issue.
 */
export async function publishPhotoToFacebookPage(
  imageUrl: string,
  caption: string
): Promise<{ id: string; post_id: string }> {
  if (!isConfiguredForFacebook()) {
    throw new Error('Facebook credentials are missing. Update your .env file.');
  }

  const endpoint = `https://graph.facebook.com/v21.0/${env.PAGE_ID}/photos`;
  console.log(`[Facebook Service] 📸 Publishing photo post to Page ID (${env.PAGE_ID})...`);

  try {
    const response = await axios.post<{ id: string; post_id?: string }>(
      endpoint,
      {
        url: imageUrl,
        caption: caption.trim(),
      },
      {
        params: { access_token: env.PAGE_ACCESS_TOKEN },
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000,
      }
    );

    if (response.data && response.data.id) {
      const effectivePostId = response.data.post_id || `${env.PAGE_ID}_${response.data.id}`;
      console.log(`[Facebook Service] ✅ Photo published successfully! Photo ID: ${response.data.id}, Post ID: ${effectivePostId}`);
      return { id: response.data.id, post_id: effectivePostId };
    }

    throw new Error('Meta Graph API photo response did not return a valid ID.');
  } catch (photoError: any) {
    console.warn(`[Facebook Service Warning] Photo publishing failed (${photoError.message}). Executing fallback to text feed...`);
    const fallbackResponse = await publishToFacebookPage(caption);
    return {
      id: fallbackResponse.id,
      post_id: fallbackResponse.post_id || fallbackResponse.id,
    };
  }
}

/**
 * Publishes a multi-photo / carousel post to the Facebook Page using Meta Graph API v21.0.
 * Uploads photos as unpublished media, then attaches them to a single carousel feed post.
 */
export async function publishMultiPhotoPost(
  imageUrls: string[],
  caption: string
): Promise<{ id: string; post_id: string }> {
  if (!isConfiguredForFacebook()) {
    throw new Error('Facebook credentials are missing.');
  }

  if (imageUrls.length <= 1) {
    return publishPhotoToFacebookPage(imageUrls[0], caption);
  }

  console.log(`[Facebook Service] 🎠 Publishing ${imageUrls.length}-slide carousel post to Page ID (${env.PAGE_ID})...`);

  try {
    const attachedMedia: { media_fbid: string }[] = [];

    // Step 1: Upload each image with published: false to get media IDs
    for (const imgUrl of imageUrls) {
      const uploadRes = await axios.post<{ id: string }>(
        `https://graph.facebook.com/v21.0/${env.PAGE_ID}/photos`,
        {
          url: imgUrl,
          published: false,
        },
        {
          params: { access_token: env.PAGE_ACCESS_TOKEN },
          timeout: 40000,
        }
      );

      if (uploadRes.data?.id) {
        attachedMedia.push({ media_fbid: uploadRes.data.id });
      }
    }

    // Step 2: Publish the combined carousel post to Page feed
    const feedRes = await axios.post<FacebookPublishResponse>(
      `https://graph.facebook.com/v21.0/${env.PAGE_ID}/feed`,
      {
        message: caption.trim(),
        attached_media: attachedMedia,
      },
      {
        params: { access_token: env.PAGE_ACCESS_TOKEN },
        timeout: 30000,
      }
    );

    if (feedRes.data && feedRes.data.id) {
      console.log(`[Facebook Service] ✅ Carousel published successfully! Post ID: ${feedRes.data.id}`);
      return { id: feedRes.data.id, post_id: feedRes.data.id };
    }

    throw new Error('Multi-photo feed post did not return valid ID.');
  } catch (carouselError: any) {
    console.warn(`[Facebook Service Warning] Carousel upload failed (${carouselError.message}). Falling back to single photo post...`);
    return publishPhotoToFacebookPage(imageUrls[0], caption);
  }
}

/**
 * Adds a comment to a published post (Used for First Comment Link Automation)
 */
export async function addCommentToPost(postId: string, message: string): Promise<{ id: string }> {
  if (!isConfiguredForFacebook()) {
    throw new Error('Facebook credentials are not configured.');
  }

  const endpoint = `https://graph.facebook.com/v21.0/${postId}/comments`;
  console.log(`[Facebook Service] 📌 Adding First Comment to Post ID: ${postId}...`);

  try {
    const response = await axios.post<{ id: string }>(
      endpoint,
      { message: message.trim() },
      {
        params: { access_token: env.PAGE_ACCESS_TOKEN },
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      }
    );

    if (response.data && response.data.id) {
      console.log(`[Facebook Service] ✅ First Comment added successfully! Comment ID: ${response.data.id}`);
      return { id: response.data.id };
    }

    throw new Error('Meta Graph API comment response did not contain ID.');
  } catch (error: any) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error(`[Facebook Service Error] Failed to add comment to post ${postId}:`, msg);
    throw new Error(`Add comment failed: ${msg}`);
  }
}

/**
 * Replies publicly to a user comment on a page post via Meta Graph API v21.0
 */
export async function replyToComment(commentId: string, message: string): Promise<{ id: string }> {
  if (!isConfiguredForFacebook()) {
    throw new Error('Facebook credentials are not configured.');
  }

  const endpoint = `https://graph.facebook.com/v21.0/${commentId}/comments`;
  console.log(`[Facebook Service] 💬 Replying to Comment ID: ${commentId}...`);

  try {
    const response = await axios.post<{ id: string }>(
      endpoint,
      { message: message.trim() },
      {
        params: { access_token: env.PAGE_ACCESS_TOKEN },
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      }
    );

    if (response.data && response.data.id) {
      console.log(`[Facebook Service] ✅ Reply published! Reply ID: ${response.data.id}`);
      return { id: response.data.id };
    }

    throw new Error('Meta Graph API response did not contain a valid reply ID.');
  } catch (error: any) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error(`[Facebook Service Error] Failed to reply to comment ${commentId}:`, msg);
    throw new Error(`Comment reply failed: ${msg}`);
  }
}

/**
 * Sends a private reply in Messenger to a user comment via Meta Graph API
 * Route: POST /{comment-id}/private_replies
 */
export async function sendPrivateReplyToComment(commentId: string, message: string): Promise<boolean> {
  if (!isConfiguredForFacebook()) return false;

  const endpoint = `https://graph.facebook.com/v21.0/${commentId}/private_replies`;
  console.log(`[Facebook Service] 📩 Attempting private Messenger reply to Comment ID: ${commentId}...`);

  try {
    const response = await axios.post(
      endpoint,
      { message: message.trim() },
      {
        params: { access_token: env.PAGE_ACCESS_TOKEN },
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
      }
    );

    if (response.data && response.data.id) {
      console.log(`[Facebook Service] ✅ Private Messenger reply sent! ID: ${response.data.id}`);
      return true;
    }
    return false;
  } catch (err: any) {
    console.warn(`[Facebook Service Notice] Private reply not permitted or failed (${err.response?.data?.error?.message || err.message}). Public reply will be used.`);
    return false;
  }
}
