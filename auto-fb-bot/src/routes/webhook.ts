import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { processIncomingComment } from '../services/comments';

const router = Router();

/**
 * Facebook Webhook Handshake Verification
 * Route: GET /webhook
 * Meta sends hub.mode, hub.verify_token, and hub.challenge
 */
router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  console.log('[Webhook Verification] Incoming handshake verification request:', {
    mode,
    tokenProvided: Boolean(token),
  });

  if (mode && token) {
    if (mode === 'subscribe' && token === env.VERIFY_TOKEN) {
      console.log('[Webhook Verification] ✅ Webhook verified successfully by Meta.');
      res.status(200).send(challenge);
      return;
    }

    console.warn('[Webhook Verification Failed] Token mismatch or invalid mode.');
    res.status(403).send('Forbidden: Token mismatch or invalid mode');
    return;
  }

  res.status(400).send('Bad Request: Missing hub.mode or hub.verify_token query parameters');
});

/**
 * Facebook Webhook Event Receiver
 * Route: POST /webhook
 * Meta sends notifications for page events (feed posts, comments, messages, reactions)
 */
router.post('/', (req: Request, res: Response) => {
  const body = req.body;

  // Immediate 200 OK acknowledgement to Meta as required by Graph API
  res.status(200).send('EVENT_RECEIVED');

  // Check if this is an event from a Facebook page subscription
  if (body.object === 'page' && Array.isArray(body.entry)) {
    body.entry.forEach((entry: any) => {
      // Process Page feed changes (e.g. comments, status updates)
      if (Array.isArray(entry.changes)) {
        entry.changes.forEach((change: any) => {
          const val = change.value;
          if (!val) return;

          // Detect new comment on page posts
          const isComment = val.item === 'comment' && (val.verb === 'add' || !val.verb);
          if (isComment && val.message) {
            const commentId = val.comment_id || val.id;
            const message = val.message;
            const postId = val.post_id || val.parent_id;
            const senderId = val.from?.id || val.sender_id;
            const senderName = val.from?.name || val.sender_name;

            // Process comment asynchronously
            processIncomingComment({
              commentId,
              message,
              postId,
              senderId,
              senderName,
            }).catch((err) => {
              console.error('[Webhook Error] Error handling comment event:', err);
            });
          }
        });
      }
    });
  }
});

export default router;
