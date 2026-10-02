import axios from 'axios';
import { env, isConfiguredForGemini } from '../config/env';
import { saveJobLog } from './db';
import { ReelsScriptData } from './ai';
import {
  validateScriptSpecificity,
  BANNED_ABSTRACT_PHRASES,
  BANNED_ROBOTIC_CLICHES,
  RECOGNIZED_SOFTWARE_TOOLS,
  RECOGNIZED_ACTION_PATTERNS,
} from './prompts';

export interface CriticAuditResult {
  originalPost: string;
  approvedPost: string;
  overallScore: number;
  rubric: {
    factualAccuracy: number;
    bengaliFlow: number;
    hookStrength: number;
    valueDelivery: number;
  };
  feedback: string;
  wasRevised: boolean;
  rejected?: boolean;
  rejectionReasons?: string[];
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text: string }[];
    };
  }[];
}

/**
 * Strict Critic Audit for Facebook Reels Video Scripts (30-40s)
 * Enforces:
 * 1. ZERO abstract placeholder phrases (BAN: "এই কাজটা", "এই দারুণ টেকনিকটি", etc.)
 * 2. Mandatory recognized software/tool name (ChatGPT, VS Code, Google Sheets, Excel, Windows, etc.)
 * 3. Mandatory concrete shortcut, prompt, formula, or actionable step
 *
 * If the script is generic (no specific tool or action mentioned, or contains banned phrases),
 * Critic MUST reject it with score 0!
 */
export async function auditReelsScript(
  scriptInput: ReelsScriptData | string,
  topicTitle: string
): Promise<CriticAuditResult> {
  const scriptText = typeof scriptInput === 'string'
    ? scriptInput.trim()
    : (scriptInput.fullScript || `${scriptInput.hook} ${scriptInput.body} ${scriptInput.cta}`).trim();

  console.log(`[Critic Service] 🧐 Initiating strict Reels script specificity audit for: "${topicTitle}"...`);

  // 1. Programmatic Deterministic Check (Fast & Uncompromising)
  const specificity = validateScriptSpecificity(scriptText);

  if (!specificity.isValid) {
    console.warn(`[Critic Service] ❌ SCRIPT REJECTED WITH SCORE 0!`);
    specificity.failureReasons.forEach(reason => {
      console.warn(`[Critic Service] 🚫 Violation: ${reason}`);
    });

    const rejectionFeedback = `REJECTED (Score 0): Script is generic or contains abstract placeholders. Reasons: ${specificity.failureReasons.join('; ')}`;

    await saveJobLog(
      'CRITIC_AUDIT_REEL',
      'FAILED',
      `Topic: "${topicTitle}", Score: 0/100, Generic/Abstract Script Rejected: ${specificity.failureReasons.join(', ')}`
    );

    return {
      originalPost: scriptText,
      approvedPost: '',
      overallScore: 0,
      rubric: { factualAccuracy: 0, bengaliFlow: 0, hookStrength: 0, valueDelivery: 0 },
      feedback: rejectionFeedback,
      wasRevised: false,
      rejected: true,
      rejectionReasons: specificity.failureReasons,
    };
  }

  console.log(`[Critic Service] 🎯 Specificity Verified: Tool: "${specificity.toolFound}", Action/Step: "${specificity.actionFound}"`);

  // If Gemini is not configured, pass with the verified programmatic score
  if (!isConfiguredForGemini()) {
    return {
      originalPost: scriptText,
      approvedPost: scriptText,
      overallScore: 92,
      rubric: { factualAccuracy: 9, bengaliFlow: 9, hookStrength: 9, valueDelivery: 9 },
      feedback: 'Offline specificity validation passed with recognized tool and actionable step.',
      wasRevised: false,
      rejected: false,
    };
  }

  // 2. Deep LLM Reflection & Flow Rubric
  const criticPrompt = `You are the Lead Technical Director and Algorithmic Quality Auditor for "ByteBangla".
Audit this 30-40 second Bengali Facebook Reel script:

TOPIC: "${topicTitle}"
REEL SCRIPT:
"""
${scriptText}
"""

AUDIT RULES & RUBRIC (Score 1 to 10 each):
1. Factual Accuracy: Is the named software tool (${specificity.toolFound}) and shortcut/formula real and accurate? (1-10)
2. Casual Human Tone: Is it 100% natural Dhaka tech mentor Bengali (Senior Developer tone)?
   - REJECT (Score 0) if it contains: "এই কাজটা", "এই দারুণ টেকনিকটি", "এই টুলটি", "একটা দারুণ উপায়", "এই সেটিংসটি"
   - DEDUCT 5 points for robotic words: "চলুন জেনে নেওয়া যাক", "যুগান্তকারী", "অতএব", "বিস্তারিত আলোচনা"
3. 3 Psychological Growth Hooks:
   - Target Audience Hook (0-5s): Does it call out Office Workers, Students, or Tech Freelancers along with the software name? (1-10)
   - High-Value Save Trigger: Does it contain "পরে দরকার হতে পারে, তাই ভিডিওটি এখনই Save করে রাখুন!"? (Bonus +1)
   - Signature Human Identity: Does it end with "এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!"? (Bonus +1)
4. Phase 2-3 Actionable Value: Are the tool/formula name and step-by-step instructions concrete? (1-10)

TASK:
- If ANY banned placeholder phrase is found or the script lacks concrete instructions: set overallScore = 0 and needsRevision = true.
- If score is under 85%, provide an improved 30-40s script in "improvedScript" strictly adhering to the 4-phase concrete formula with target audience hook, Save trigger, and signature ending.

Return ONLY a valid JSON object:
{
  "factualAccuracy": 9,
  "bengaliFlow": 9,
  "hookStrength": 9,
  "valueDelivery": 9,
  "feedback": "Concise technical critique",
  "needsRevision": false,
  "improvedScript": "Full 30-40s revised script if needed"
}`;

  const modelsToTry = [
    process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
  ];

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const response = await axios.post<GeminiResponse>(
        endpoint,
        {
          contents: [{ role: 'user', parts: [{ text: criticPrompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
      );

      const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (raw) {
        const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        const factualAccuracy = Math.min(10, Math.max(1, parsed.factualAccuracy || 9));
        const bengaliFlow = Math.min(10, Math.max(1, parsed.bengaliFlow || 9));
        const hookStrength = Math.min(10, Math.max(1, parsed.hookStrength || 9));
        const valueDelivery = Math.min(10, Math.max(1, parsed.valueDelivery || 9));

        let overallScore = Math.round(
          ((factualAccuracy + bengaliFlow + hookStrength + valueDelivery) / 40) * 100
        );

        let finalScript = scriptText;
        let wasRevised = false;

        if (parsed.needsRevision && parsed.improvedScript?.trim().length > 60) {
          const improved = parsed.improvedScript.trim();
          const improvedCheck = validateScriptSpecificity(improved);
          if (improvedCheck.isValid) {
            finalScript = improved;
            wasRevised = true;
            overallScore = Math.max(88, overallScore);
            console.log(`[Critic Service] ✍️ Script refined with concrete 4-phase formula.`);
          } else {
            console.warn(`[Critic Service] ⚠️ LLM improved script still failed specificity. Retaining original valid script.`);
          }
        }

        console.log(`[Critic Service] 🏆 Reel Script Score: ${overallScore}/100 (Accuracy: ${factualAccuracy}, Flow: ${bengaliFlow}, Hook: ${hookStrength}, Value: ${valueDelivery})`);

        await saveJobLog(
          'CRITIC_AUDIT_REEL',
          'COMPLETED',
          `Topic: "${topicTitle}", Score: ${overallScore}/100, Revised: ${wasRevised}, Feedback: ${parsed.feedback || 'Approved'}`
        );

        return {
          originalPost: scriptText,
          approvedPost: finalScript,
          overallScore,
          rubric: { factualAccuracy, bengaliFlow, hookStrength, valueDelivery },
          feedback: parsed.feedback || 'Critic audit passed with concrete specificity.',
          wasRevised,
          rejected: false,
        };
      }
    } catch (err: any) {
      console.warn(`[Critic Service Warning] Model "${model}" audit attempt failed: ${err.message}. Trying next...`);
    }
  }

  // Fallback: Programmatic check was already valid
  return {
    originalPost: scriptText,
    approvedPost: scriptText,
    overallScore: 90,
    rubric: { factualAccuracy: 9, bengaliFlow: 9, hookStrength: 9, valueDelivery: 9 },
    feedback: 'Approved via programmatic specificity validation (recognized tool & shortcut).',
    wasRevised: false,
    rejected: false,
  };
}

/**
 * Self-Reflection & Critic Audit Service for Facebook Feed Posts
 * Evaluates generated content against a strict 4-dimensional rubric and auto-refines if score < 85%
 *
 * @param draftPost The initial post generated by the AI service
 * @param topicTitle The topic title
 */
export async function auditAndReflectPost(
  draftPost: string,
  topicTitle: string
): Promise<CriticAuditResult> {
  console.log(`[Critic Service] 🧐 Initiating self-reflection audit for topic: "${topicTitle}"...`);

  // Programmatic specificity check
  const specificity = validateScriptSpecificity(draftPost);
  if (!specificity.isValid && specificity.bannedPhrasesFound.length > 0) {
    console.warn(`[Critic Service] ⚠️ Post contains prohibited abstract placeholder(s): ${specificity.bannedPhrasesFound.join(', ')}`);
  }

  // Default fallback if Gemini is not configured
  if (!isConfiguredForGemini()) {
    const defaultScore = specificity.isValid ? 90 : 70;
    return {
      originalPost: draftPost,
      approvedPost: draftPost,
      overallScore: defaultScore,
      rubric: { factualAccuracy: 8, bengaliFlow: 8, hookStrength: 8, valueDelivery: 8 },
      feedback: 'Offline validation evaluated.',
      wasRevised: false,
    };
  }

  const criticPrompt = `You are the Chief Quality Editor and Technical Auditor for "ByteBangla" (সহজ বাংলায় এআই ও টেকনোলজি টিপস).
Your task is to ruthlessly critique, score, and self-reflect upon the following Facebook post draft before it gets published.

TOPIC: "${topicTitle}"
DRAFT TO AUDIT:
"""
${draftPost}
"""

EVALUATION RUBRIC (Score each from 1 to 10):
1. Factual Accuracy: Are the tools, sites, and advice real, verified, and error-free? (1-10)
2. Casual Human Bengali: Is the Bengali natural, conversational (Dhaka Senior Developer tone), and 100% FREE from robotic cliches?
   - DEDUCT 5 POINTS if it contains: "চলুন জেনে নেওয়া যাক", "যুগান্তকারী", "অতএব", "বিস্তারিত আলোচনা", "ভূমিকা পালন করে", "উল্লেখযোগ্য"।
   - DEDUCT 5 POINTS if it contains abstract placeholders: "এই কাজটা", "এই দারুণ টেকনিকটি", "এই টুলটি", "একটা দারুণ উপায়", "এই সেটিংসটি"।
3. 3 Psychological Growth Hooks:
   - Target Audience Hook (0-5s): Does it directly call out Office Workers, Students, or Tech Freelancers along with the software name? (1-10)
   - High-Value Save Trigger: Does it contain "কাজটি পরে করার সময় ভুলে যেতে পারেন, তাই পোস্টটি এখনই সেভ করে রাখুন এবং বন্ধুদের সাথে শেয়ার করুন!"? (Bonus +1)
   - Signature Creator Ending: Does it end with "এমন দরকারী সব টেক হ্যাকসের জন্য সাথে থাকুন বাইট বাংলার!"? (Bonus +1)
4. 60-Second Actionable Value: Are there 3 concrete takeaways with real shortcuts/prompts/formulas that can be used immediately? (1-10)

TASK:
- Calculate scores for all 4 dimensions.
- If the overall score is below 85% OR if ANY banned placeholders/robotic cliches are found:
  You MUST REWRITE and IMPROVE the post in "improvedPost", explicitly naming the real software (e.g. Google Sheets, VS Code, ChatGPT) with concrete copy-pasteable shortcuts/formulas, target audience hook, save trigger, and signature ending.
- If it is already top-tier, return it polished.

Return ONLY a valid JSON object without markdown code fences:
{
  "factualAccuracy": 9,
  "bengaliFlow": 9,
  "hookStrength": 9,
  "valueDelivery": 9,
  "feedback": "Short critique explaining strengths and weaknesses",
  "needsRevision": true,
  "improvedPost": "Polished, ready-to-publish human-toned Facebook post text in Bengali"
}`;

  const modelsToTry = [
    process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
  ];

  for (const model of modelsToTry) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const response = await axios.post<GeminiResponse>(
        endpoint,
        {
          contents: [{ role: 'user', parts: [{ text: criticPrompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1600 },
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
      );

      const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (raw) {
        const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleaned);

        const factualAccuracy = Math.min(10, Math.max(1, parsed.factualAccuracy || 8));
        const bengaliFlow = Math.min(10, Math.max(1, parsed.bengaliFlow || 8));
        const hookStrength = Math.min(10, Math.max(1, parsed.hookStrength || 8));
        const valueDelivery = Math.min(10, Math.max(1, parsed.valueDelivery || 8));

        let overallScore = Math.round(
          ((factualAccuracy + bengaliFlow + hookStrength + valueDelivery) / 40) * 100
        );

        // If banned abstract phrases found, penalize
        if (specificity.bannedPhrasesFound.length > 0) {
          overallScore = Math.min(overallScore, 65);
        }

        const needsRevision = parsed.needsRevision || overallScore < 85;
        const finalPost = (needsRevision && parsed.improvedPost?.trim().length > 100)
          ? parsed.improvedPost.trim()
          : draftPost;

        const wasRevised = needsRevision && finalPost !== draftPost;

        console.log(`[Critic Service] 📊 Audit Score: ${overallScore}/100 (Accuracy: ${factualAccuracy}, Flow: ${bengaliFlow}, Hook: ${hookStrength}, Value: ${valueDelivery})`);
        if (wasRevised) {
          console.log(`[Critic Service] ✍️ Post was automatically refined by the Critic to meet quality standards.`);
        } else {
          console.log(`[Critic Service] ✅ Post passed audit on first evaluation.`);
        }

        await saveJobLog(
          'CRITIC_AUDIT_FEED',
          'COMPLETED',
          `Topic: "${topicTitle}", Score: ${overallScore}/100, Revised: ${wasRevised}, Feedback: ${parsed.feedback || 'None'}`
        );

        return {
          originalPost: draftPost,
          approvedPost: finalPost,
          overallScore,
          rubric: { factualAccuracy, bengaliFlow, hookStrength, valueDelivery },
          feedback: parsed.feedback || 'Audit completed.',
          wasRevised,
        };
      }
    } catch (err: any) {
      console.warn(`[Critic Service Warning] Model "${model}" audit attempt failed: ${err.message}. Trying next...`);
    }
  }

  // Graceful fallback if critic call times out
  console.log(`[Critic Service] ℹ️ Using draft post directly as fallback.`);
  return {
    originalPost: draftPost,
    approvedPost: draftPost,
    overallScore: specificity.isValid ? 88 : 70,
    rubric: { factualAccuracy: 8, bengaliFlow: 8, hookStrength: 8, valueDelivery: 8 },
    feedback: 'Evaluated with standard baseline heuristic.',
    wasRevised: false,
  };
}
