import fs from 'fs';
import path from 'path';

export interface TopicRecord {
  id: string;
  title: string;
  titleHash: string;
  category: string;
  score: number;
  status: string;
  createdAt: string;
}

export interface PostRecord {
  id: string;
  facebookPostId: string;
  topicId?: string;
  caption: string;
  imageUrl?: string;
  publishedAt: string;
  status: string;
}

export interface CommentRecord {
  id: string;
  facebookCommentId: string;
  postId?: string;
  senderName?: string;
  senderId?: string;
  text: string;
  classification: string;
  isFlagged: boolean;
  createdAt: string;
}

export interface ReplyRecord {
  id: string;
  commentId: string;
  replyText: string;
  facebookReplyId?: string;
  status: string;
  createdAt: string;
}

export interface JobLogRecord {
  id: string;
  jobName: string;
  status: string;
  details?: string;
  createdAt: string;
}

interface LocalStore {
  topics: TopicRecord[];
  posts: PostRecord[];
  comments: CommentRecord[];
  replies: ReplyRecord[];
  jobLogs: JobLogRecord[];
}

const DB_FILE_PATH = path.resolve(process.cwd(), 'data', 'store.json');

// In-memory fallback database
const memoryStore: LocalStore = {
  topics: [],
  posts: [],
  comments: [],
  replies: [],
  jobLogs: [],
};

let isPrismaAvailable = false;
let prismaInstance: any = null;

// Attempt to initialize Prisma if DATABASE_URL is set
function initPrisma(): void {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && dbUrl.startsWith('postgres') && !dbUrl.includes('placeholder')) {
    try {
      const { PrismaClient } = require('@prisma/client');
      prismaInstance = new PrismaClient();
      isPrismaAvailable = true;
      console.log('[Database Service] 🗄️ PostgreSQL connection configured via Prisma.');
    } catch (err: any) {
      console.warn(`[Database Service] Prisma client not initialized (${err.message}). Using resilient local store.`);
      isPrismaAvailable = false;
    }
  } else {
    console.log('[Database Service] 💾 Running in Resilient Local Store mode (No PostgreSQL DATABASE_URL required).');
  }
}

// Load local JSON store
function initLocalStore(): void {
  try {
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      memoryStore.topics = parsed.topics || [];
      memoryStore.posts = parsed.posts || [];
      memoryStore.comments = parsed.comments || [];
      memoryStore.replies = parsed.replies || [];
      memoryStore.jobLogs = parsed.jobLogs || [];
      console.log(`[Database Service] Loaded ${memoryStore.posts.length} historical posts from local store.`);
    }
  } catch (err: any) {
    console.warn(`[Database Service Warning] Could not load local store: ${err.message}`);
  }
}

initPrisma();
initLocalStore();

function persistLocalStore(): void {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(memoryStore, null, 2), 'utf-8');
  } catch (err: any) {
    console.error(`[Database Service Error] Failed to persist local store: ${err.message}`);
  }
}

export function isDatabaseConnected(): boolean {
  return isPrismaAvailable;
}

export async function saveTopic(topic: Omit<TopicRecord, 'id' | 'createdAt'>): Promise<TopicRecord> {
  const record: TopicRecord = {
    ...topic,
    id: `topic_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  if (isPrismaAvailable && prismaInstance) {
    try {
      return await prismaInstance.topic.create({ data: record });
    } catch (e: any) {
      console.warn('[Database Fallback] Prisma saveTopic failed, writing to local store:', e.message);
    }
  }

  memoryStore.topics.unshift(record);
  persistLocalStore();
  return record;
}

export async function savePost(post: Omit<PostRecord, 'id' | 'publishedAt'>): Promise<PostRecord> {
  const record: PostRecord = {
    ...post,
    id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    publishedAt: new Date().toISOString(),
  };

  if (isPrismaAvailable && prismaInstance) {
    try {
      return await prismaInstance.post.create({ data: record });
    } catch (e: any) {
      console.warn('[Database Fallback] Prisma savePost failed, writing to local store:', e.message);
    }
  }

  memoryStore.posts.unshift(record);
  persistLocalStore();
  return record;
}

export async function getRecentPosts(limit: number = 5): Promise<PostRecord[]> {
  if (isPrismaAvailable && prismaInstance) {
    try {
      return await prismaInstance.post.findMany({
        take: limit,
        orderBy: { publishedAt: 'desc' },
      });
    } catch (e: any) {
      console.warn('[Database Fallback] Prisma getRecentPosts failed, reading local store:', e.message);
    }
  }

  return memoryStore.posts.slice(0, limit);
}

export async function getAllPosts(): Promise<PostRecord[]> {
  if (isPrismaAvailable && prismaInstance) {
    try {
      return await prismaInstance.post.findMany({
        orderBy: { publishedAt: 'desc' },
      });
    } catch (e: any) {
      // Fallback
    }
  }
  return [...memoryStore.posts];
}

export async function findPostByFacebookId(facebookPostId: string): Promise<PostRecord | null> {
  const cleanId = facebookPostId.trim();
  const directMatch = memoryStore.posts.find(
    (p) => p.facebookPostId === cleanId || p.facebookPostId.endsWith(`_${cleanId}`) || cleanId.endsWith(`_${p.facebookPostId}`)
  );
  if (directMatch) return directMatch;

  if (isPrismaAvailable && prismaInstance) {
    try {
      return await prismaInstance.post.findFirst({
        where: {
          facebookPostId: {
            contains: cleanId,
          },
        },
      });
    } catch (e: any) {
      // Fallback
    }
  }
  return null;
}

export async function saveComment(comment: Omit<CommentRecord, 'id' | 'createdAt'>): Promise<CommentRecord> {
  const record: CommentRecord = {
    ...comment,
    id: `comment_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  if (isPrismaAvailable && prismaInstance) {
    try {
      return await prismaInstance.comment.create({ data: record });
    } catch (e: any) {
      console.warn('[Database Fallback] Prisma saveComment failed, writing to local store:', e.message);
    }
  }

  memoryStore.comments.unshift(record);
  persistLocalStore();
  return record;
}

export async function saveReply(reply: Omit<ReplyRecord, 'id' | 'createdAt'>): Promise<ReplyRecord> {
  const record: ReplyRecord = {
    ...reply,
    id: `reply_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  if (isPrismaAvailable && prismaInstance) {
    try {
      return await prismaInstance.reply.create({ data: record });
    } catch (e: any) {
      console.warn('[Database Fallback] Prisma saveReply failed, writing to local store:', e.message);
    }
  }

  memoryStore.replies.unshift(record);
  persistLocalStore();
  return record;
}

export async function getRecentComments(limit: number = 5): Promise<{ comment: CommentRecord; replies: ReplyRecord[] }[]> {
  const comments = memoryStore.comments.slice(0, limit);
  return comments.map((c) => ({
    comment: c,
    replies: memoryStore.replies.filter((r) => r.commentId === c.id || r.commentId === c.facebookCommentId),
  }));
}

export async function saveJobLog(jobName: string, status: string, details?: string): Promise<JobLogRecord> {
  const record: JobLogRecord = {
    id: `log_${Date.now()}`,
    jobName,
    status,
    details,
    createdAt: new Date().toISOString(),
  };

  if (isPrismaAvailable && prismaInstance) {
    try {
      await prismaInstance.jobLog.create({ data: record });
    } catch (e: any) {
      // Fallback silently
    }
  }

  memoryStore.jobLogs.unshift(record);
  if (memoryStore.jobLogs.length > 50) memoryStore.jobLogs.pop();
  persistLocalStore();
  return record;
}
