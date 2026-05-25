/**
 * NLP Task Creation Service (F12)
 * Responsible for extracting structured task data from natural language using Groq.
 */

import { askGroqChat } from './ai.service.js';
import { extractJSON } from './ai.service.js';

const TODAY = () => new Date().toISOString().split('T')[0]; // YYYY-MM-DD

/**
 * Resolve a relative date expression to an absolute YYYY-MM-DD string.
 * Handles "today", "tomorrow", "friday", "next week", specific dates, etc.
 * Falls back to null if unparseable.
 */
function resolveRelativeDate(raw) {
  if (!raw || raw === 'null' || raw === 'none') return null;

  const now = new Date();
  const lower = raw.toLowerCase().trim();

  if (lower === 'today') {
    return now.toISOString().split('T')[0];
  }

  if (lower === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  if (lower === 'next week') {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }

  // Named weekdays: "friday", "monday", etc.
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIdx = weekdays.indexOf(lower);
  if (dayIdx !== -1) {
    const d = new Date(now);
    const currentDay = d.getDay();
    let diff = dayIdx - currentDay;
    if (diff <= 0) diff += 7; // Always pick next occurrence
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  }

  // Try parsing as a date string (ISO or natural)
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Build the Groq chat messages for task extraction.
 * Uses system + user separation for better accuracy.
 */
function buildNLPExtractionMessages(userMessage) {
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const systemPrompt = `You are an expert AI task parser for SmartOps, a project management platform.

TODAY IS: ${todayStr}

Your ONLY job is to extract structured task information from the user's natural language input.

EXTRACTION RULES:
1. title: Short, clear task name (2-6 words). Remove filler words like "create", "add", "make", "assign". Capitalize properly.
2. description: A brief 1-sentence description of the task. Can mention type (bug, feature, etc.).
3. assigneeName: Full or partial name of the person to assign. Return null if not mentioned.
4. priority: Must be exactly "LOW", "MEDIUM", or "HIGH". Default to "MEDIUM" if not specified. Map "urgent"/"critical" → HIGH, "minor"/"low" → LOW.
5. deadline: Relative date from user input (e.g., "friday", "tomorrow", "next week", "2026-05-20"). Return the DATE STRING exactly as mentioned — do NOT resolve it. Return null if not mentioned.
6. status: Always return "TODO" for new tasks.

RESPOND WITH ONLY THIS EXACT JSON — NO MARKDOWN, NO EXPLANATION, NOTHING ELSE:
{
  "title": "string",
  "description": "string",
  "assigneeName": "string or null",
  "priority": "LOW|MEDIUM|HIGH",
  "deadline": "date string or null",
  "status": "TODO"
}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

/**
 * Extract task fields from natural language using Groq AI.
 * @param {string} message - Natural language task description
 * @returns {Promise<object>} - Extracted task fields
 */
export async function extractTaskFromNLP(message) {
  console.log('[NLP] Extracting task from:', message);

  const messages = buildNLPExtractionMessages(message);

  let rawResponse = null;
  try {
    rawResponse = await askGroqChat(messages, {
      temperature: 0.1,  // Low temp for deterministic JSON
      maxTokens: 512,
    });

    console.log('[NLP] Raw Groq response:', rawResponse);

    const parsed = extractJSON(rawResponse);
    console.log('[NLP] Parsed JSON:', parsed);

    // Normalize and validate the extracted data
    const normalized = {
      title: (parsed.title || 'New Task').trim(),
      description: (parsed.description || '').trim(),
      assigneeName: parsed.assigneeName && parsed.assigneeName !== 'null' ? parsed.assigneeName.trim() : null,
      priority: ['LOW', 'MEDIUM', 'HIGH'].includes(String(parsed.priority).toUpperCase())
        ? String(parsed.priority).toUpperCase()
        : 'MEDIUM',
      deadline: resolveRelativeDate(parsed.deadline),
      status: 'TODO',
    };

    console.log('[NLP] Normalized extraction:', normalized);
    return normalized;

  } catch (error) {
    console.error('[NLP] Groq extraction failed:', error.message);
    console.error('[NLP] Raw response was:', rawResponse);

    // Fallback: basic heuristic extraction
    return fallbackExtraction(message);
  }
}

/**
 * Basic fallback extraction using keyword heuristics.
 * Used when Groq fails or returns malformed JSON.
 */
function fallbackExtraction(message) {
  console.log('[NLP Fallback] Using heuristic extraction');

  const lower = message.toLowerCase();

  // Extract priority
  let priority = 'MEDIUM';
  if (lower.includes('high priority') || lower.includes('urgent') || lower.includes('critical')) {
    priority = 'HIGH';
  } else if (lower.includes('low priority') || lower.includes('minor')) {
    priority = 'LOW';
  }

  // Extract deadline
  let deadline = null;
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const day of weekdays) {
    if (lower.includes(day)) {
      deadline = resolveRelativeDate(day);
      break;
    }
  }
  if (!deadline && lower.includes('tomorrow')) {
    deadline = resolveRelativeDate('tomorrow');
  }
  if (!deadline && lower.includes('today')) {
    deadline = resolveRelativeDate('today');
  }
  if (!deadline && lower.includes('next week')) {
    deadline = resolveRelativeDate('next week');
  }

  // Extract assignee name (word after "for" or "to" that's capitalized)
  let assigneeName = null;
  const forMatch = message.match(/(?:for|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (forMatch) {
    assigneeName = forMatch[1];
  }

  // Build title by removing common filler
  const stopWords = ['create', 'add', 'make', 'assign', 'task', 'a', 'an', 'the', 'for', 'to', 'due',
    'high', 'low', 'medium', 'priority', 'urgent', 'critical', 'tomorrow', 'today', 'next', 'week',
    ...weekdays];

  const words = message.split(/\s+/).filter(w => {
    const wl = w.toLowerCase().replace(/[^a-z]/g, '');
    return !stopWords.includes(wl) && wl.length > 1;
  });

  // Remove assignee name from title words
  let titleWords = words;
  if (assigneeName) {
    const nameParts = assigneeName.toLowerCase().split(' ');
    titleWords = words.filter(w => !nameParts.includes(w.toLowerCase()));
  }

  const title = titleWords.slice(0, 5).join(' ') || 'New Task';

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    description: `Task created from: "${message}"`,
    assigneeName,
    priority,
    deadline,
    status: 'TODO',
  };
}

/**
 * Detect whether a message has task creation intent.
 * @param {string} message
 * @returns {boolean}
 */
export function detectTaskIntent(message) {
  if (!message || message.trim().length < 5) return false;

  const lower = message.toLowerCase().trim();

  const taskKeywords = [
    'create task', 'create a task',
    'add task', 'add a task',
    'make task', 'make a task',
    'assign task', 'assign a task',
    'new task', 'create new task',
    'create bug', 'add bug',
    'create feature', 'add feature',
    'create issue',
    'schedule task',
    'set up task',
    'build task',
    'add work item',
    // Also detect natural phrasing
    'due friday', 'due monday', 'due tuesday', 'due wednesday',
    'due thursday', 'due saturday', 'due sunday', 'due tomorrow',
  ];

  // Strong keyword match
  for (const kw of taskKeywords) {
    if (lower.includes(kw)) return true;
  }

  // Looser detection: "create X for Y" or "assign X to Y"
  if (/^(create|add|make|assign|build)\s+\w+/.test(lower)) return true;

  return false;
}
