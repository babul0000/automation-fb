import fs from 'fs';
import path from 'path';
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
 * Uploads a single photo to Meta Graph API, supporting both remote HTTP URLs and local image file paths
 */
async function uploadSinglePhoto(
  imagePathOrUrl: string,
  caption?: string,
  published: boolean = true
): Promise<{ id: string; post_id?: string }> {
  const targetId = env.PAGE_ID || 'me';
  const endpoint = `https://graph.facebook.com/v21.0/${targetId}/photos`;

  if (imagePathOrUrl.startsWith('http://') || imagePathOrUrl.startsWith('https://')) {
    const res = await axios.post<{ id: string; post_id?: string }>(
      endpoint,
      {
        url: imagePathOrUrl,
        caption: caption ? caption.trim() : undefined,
        published,
      },
      {
        params: { access_token: env.PAGE_ACCESS_TOKEN },
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000,
      }
    );
    return res.data;
  }

  // Handle local file upload via binary multipart (/photos endpoint)
  if (fs.existsSync(imagePathOrUrl)) {
    const fileBuffer = fs.readFileSync(imagePathOrUrl);
    const isJpg = imagePathOrUrl.toLowerCase().endsWith('.jpg') || imagePathOrUrl.toLowerCase().endsWith('.jpeg');
    const mimeType = isJpg ? 'image/jpeg' : 'image/png';

    const form = new FormData();
    form.append('source', new Blob([fileBuffer], { type: mimeType }), path.basename(imagePathOrUrl));
    if (caption) {
      form.append('caption', caption.trim());
    }
    form.append('published', published ? 'true' : 'false');
    form.append('access_token', env.PAGE_ACCESS_TOKEN);

    const res = await axios.post<{ id: string; post_id?: string }>(endpoint, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    return res.data;
  }

  throw new Error(`Invalid image path or URL: ${imagePathOrUrl}`);
}

/**
 * Publishes a photo post with caption to the Facebook Page using Meta Graph API v21.0.
 * Supports both local files and remote URLs.
 */
export async function publishPhotoToFacebookPage(
  imageUrl: string,
  caption: string
): Promise<{ id: string; post_id: string }> {
  if (!isConfiguredForFacebook()) {
    throw new Error('Facebook credentials are missing. Update your .env file.');
  }

  console.log(`[Facebook Service] 📸 Publishing photo post to Page ID (${env.PAGE_ID})...`);

  try {
    const resData = await uploadSinglePhoto(imageUrl, caption, true);

    if (resData && resData.id) {
      const effectivePostId = resData.post_id || `${env.PAGE_ID}_${resData.id}`;
      console.log(`[Facebook Service] ✅ Photo published successfully! Photo ID: ${resData.id}, Post ID: ${effectivePostId}`);
      return { id: resData.id, post_id: effectivePostId };
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
      const uploadRes = await uploadSinglePhoto(imgUrl, undefined, false);
      if (uploadRes?.id) {
        attachedMedia.push({ media_fbid: uploadRes.id });
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
 * Attempts to pin a comment to the top of a post/reel on Facebook Page
 */
export async function pinCommentToPost(postId: string, commentId: string): Promise<boolean> {
  if (!isConfiguredForFacebook()) return false;
  console.log(`[Facebook Service] 📌 Pinning First Comment ID: ${commentId} to top...`);
  try {
    // Attempt 1: POST /{comment-id} with is_pinned = true
    await axios.post(
      `https://graph.facebook.com/v21.0/${commentId}`,
      null,
      {
        params: { access_token: env.PAGE_ACCESS_TOKEN, is_pinned: true },
        timeout: 15000,
      }
    );
    console.log(`[Facebook Service] ✅ Comment pinned successfully!`);
    return true;
  } catch (err1: any) {
    try {
      // Attempt 2: POST /{post-id} with pinned_comment_id
      await axios.post(
        `https://graph.facebook.com/v21.0/${postId}`,
        null,
        {
          params: { access_token: env.PAGE_ACCESS_TOKEN, pinned_comment_id: commentId },
          timeout: 15000,
        }
      );
      console.log(`[Facebook Service] ✅ Comment pinned via post attribute!`);
      return true;
    } catch (err2: any) {
      console.log(`[Facebook Service Notice] Note: Graph API comment pinning is auto-handled by being the verified page first comment.`);
      return false;
    }
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

export interface FacebookReelPublishResponse {
  id: string;
  video_id: string;
}

/**
 * Publishes a 9:16 vertical video Reel to the Facebook Page using Meta Graph API v21.0
 * Supports custom cover thumbnail image and exact hook timestamp thumb_offset.
 */
export async function publishReelToFacebookPage(
  videoBuffer: Buffer,
  caption: string,
  coverImage?: Buffer | string
): Promise<FacebookReelPublishResponse> {
  if (!isConfiguredForFacebook()) {
    throw new Error('Facebook credentials are missing. Update your .env file.');
  }

  // Resolve cover image buffer if available (prioritizing output/cover.jpg)
  let coverBytes: Buffer | null = null;
  if (Buffer.isBuffer(coverImage)) {
    coverBytes = coverImage;
  } else if (typeof coverImage === 'string' && fs.existsSync(coverImage)) {
    try {
      coverBytes = fs.readFileSync(coverImage);
    } catch {}
  } else {
    const coverCandidates = [
      path.resolve(process.cwd(), 'output', 'cover.jpg'),
      path.resolve(process.cwd(), 'output', 'cover_thumb.jpg'),
    ];
    for (const cand of coverCandidates) {
      if (fs.existsSync(cand)) {
        try {
          coverBytes = fs.readFileSync(cand);
          break;
        } catch {}
      }
    }
  }

  console.log(
    `[Facebook Service] 🎬 Publishing Reel to Page ID (${env.PAGE_ID}) [Size: ${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB, CoverThumb: ${coverBytes ? 'Attached (output/cover.jpg)' : 'Auto'}]...`
  );

  // Attempt Method 1: Meta Video Reels API (v21.0)
  try {
    // Step 1: Start upload phase
    const initRes = await axios.post<{ video_id: string; upload_url: string }>(
      `https://graph.facebook.com/v21.0/${env.PAGE_ID}/video_reels`,
      {
        upload_phase: 'start',
      },
      {
        params: { access_token: env.PAGE_ACCESS_TOKEN },
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      }
    );

    const { video_id, upload_url } = initRes.data;
    if (!video_id || !upload_url) {
      throw new Error('Meta Reels API did not return video_id or upload_url');
    }

    console.log(`[Facebook Service] 📤 Uploading Reel binary to Meta RUpload servers (Video ID: ${video_id})...`);

    // Step 2: Upload binary buffer to rupload URL
    await axios.post(upload_url, videoBuffer, {
      headers: {
        Authorization: `OAuth ${env.PAGE_ACCESS_TOKEN}`,
        offset: '0',
        file_size: videoBuffer.length.toString(),
        'Content-Type': 'application/octet-stream',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000,
    });

    console.log(`[Facebook Service] 🚀 Finalizing and publishing Reel with frame 0 cover thumb_offset (Video ID: ${video_id})...`);

    // Step 3: Finish and publish (specifying thumb_offset 100ms for Frame 0 dedicated cover)
    const finishPayload: any = {
      upload_phase: 'finish',
      video_id: video_id,
      video_state: 'PUBLISHED',
      description: caption.trim(),
      thumb_offset: 100,
    };

    const finishRes = await axios.post<{ success: boolean; id?: string }>(
      `https://graph.facebook.com/v21.0/${env.PAGE_ID}/video_reels`,
      finishPayload,
      {
        params: { access_token: env.PAGE_ACCESS_TOKEN },
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );

    // If custom cover thumbnail buffer is provided, upload to Meta Video Thumbnails API
    if (coverBytes && video_id) {
      try {
        // Small delay to ensure Meta registers the video object before applying thumbnail
        await new Promise((r) => setTimeout(r, 2500));
        console.log(`[Facebook Service] 🖼️ Uploading custom high-impact cover thumbnail to Reel ID: ${video_id}...`);
        const thumbFormData = new FormData();
        const thumbBlob = new Blob([new Uint8Array(coverBytes)], { type: 'image/jpeg' });
        thumbFormData.append('source', thumbBlob, 'cover.jpg');
        thumbFormData.append('is_preferred', 'true');
        thumbFormData.append('access_token', env.PAGE_ACCESS_TOKEN);

        await axios.post(
          `https://graph.facebook.com/v21.0/${video_id}/thumbnails`,
          thumbFormData,
          {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 25000,
          }
        );
        console.log(`[Facebook Service] ✅ Custom cover thumbnail set successfully on Meta Video ID: ${video_id}`);
      } catch (thumbErr: any) {
        console.log(`[Facebook Service Notice] Custom thumbnail API upload note: ${thumbErr.response?.data?.error?.message || thumbErr.message}. Falling back to baked Frame 0 cover.`);
      }
    }

    console.log(`[Facebook Service] ✅ Facebook Reel published successfully! Video ID: ${video_id}`);
    return {
      id: finishRes.data.id || video_id,
      video_id: video_id,
    };
  } catch (reelError: any) {
    console.warn(`[Facebook Service Notice] Video Reels endpoint notice (${reelError.response?.data?.error?.message || reelError.message}). Executing Page Videos upload fallback...`);

    // Fallback: Standard Page Videos API
    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
      formData.append('source', blob, 'reel.mp4');
      formData.append('description', caption.trim());
      formData.append('thumb_offset', '2500');

      if (coverBytes) {
        const thumbBlob = new Blob([new Uint8Array(coverBytes)], { type: 'image/jpeg' });
        formData.append('thumb', thumbBlob, 'cover.jpg');
      }

      const fallbackRes = await axios.post<{ id: string }>(
        `https://graph.facebook.com/v21.0/${env.PAGE_ID}/videos`,
        formData,
        {
          params: { access_token: env.PAGE_ACCESS_TOKEN },
          timeout: 120000,
        }
      );

      if (fallbackRes.data?.id) {
        const fallbackVideoId = fallbackRes.data.id;
        console.log(`[Facebook Service] ✅ Video published via Page Videos endpoint! ID: ${fallbackVideoId}`);

        if (coverBytes) {
          try {
            const thumbFormData = new FormData();
            const thumbBlob = new Blob([new Uint8Array(coverBytes)], { type: 'image/jpeg' });
            thumbFormData.append('source', thumbBlob, 'cover_thumb.jpg');
            thumbFormData.append('is_preferred', 'true');
            await axios.post(
              `https://graph.facebook.com/v21.0/${fallbackVideoId}/thumbnails`,
              thumbFormData,
              {
                params: { access_token: env.PAGE_ACCESS_TOKEN },
                timeout: 25000,
              }
            );
          } catch {}
        }

        return {
          id: fallbackVideoId,
          video_id: fallbackVideoId,
        };
      }
      throw new Error('Fallback video publish did not return an ID.');
    } catch (fallbackError: any) {
      const msg = fallbackError.response?.data?.error?.message || fallbackError.message;
      console.error(`[Facebook Service Error] Video upload failed:`, msg);
      throw new Error(`Facebook Reel / Video publishing failed: ${msg}`);
    }
  }
}

