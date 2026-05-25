/**
 * F28 — Meeting Notes → Tasks AI Service
 * Uses Groq to extract structured action items from raw meeting notes.
 */

import { askGroqChat, extractJSON } from './ai.service.js';

const TODAY_STR = () =>
  new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

/**
 * Resolve relative date strings from notes into ISO YYYY-MM-DD.
 */
function resolveDeadline(raw) {
  if (!raw || raw === 'null' || raw === 'none' || raw === 'N/A') return null;
  const now = new Date();
  const lower = raw.toLowerCase().trim();

  if (lower === 'today')    { return now.toISOString().split('T')[0]; }
  if (lower === 'tomorrow') { const d = new Date(now); d.setDate(d.getDate()+1); return d.toISOString().split('T')[0]; }
  if (lower === 'next week'){ const d = new Date(now); d.setDate(d.getDate()+7); return d.toISOString().split('T')[0]; }
  if (lower === 'this week'){ const d = new Date(now); d.setDate(d.getDate()+5-d.getDay()); return d.toISOString().split('T')[0]; }
  if (lower === 'end of month') {
    const d = new Date(now.getFullYear(), now.getMonth()+1, 0);
    return d.toISOString().split('T')[0];
  }

  const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const dayIdx = weekdays.indexOf(lower);
  if (dayIdx !== -1) {
    const d = new Date(now);
    let diff = dayIdx - d.getDay();
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate()+diff);
    return d.toISOString().split('T')[0];
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return null;
}

/**
 * Normalize extracted task fields to ensure valid schema.
 */
function normalizeTask(raw) {
  const validPriorities = ['LOW', 'MEDIUM', 'HIGH'];
  const priority = validPriorities.includes((raw.priority||'').toUpperCase())
    ? raw.priority.toUpperCase()
    : 'MEDIUM';

  return {
    title:        (raw.title || 'Unnamed Task').trim().slice(0, 200),
    description:  (raw.description || '').trim().slice(0, 1000),
    assigneeName: raw.assigneeName && raw.assigneeName !== 'null' && raw.assigneeName !== 'N/A'
      ? raw.assigneeName.trim()
      : null,
    priority,
    deadline:     resolveDeadline(raw.deadline),
    status:       'TODO',
    confidence:   typeof raw.confidence === 'number'
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0.8,
  };
}

/**
 * Extract action items from meeting notes using Groq.
 * @param {string} notes - Raw meeting notes / transcript text
 * @param {string[]} memberNames - Project member names for assignee hints
 * @returns {Promise<Array>} - Array of normalized task objects
 */
export async function extractTasksFromMeetingNotes(notes, memberNames = []) {
  console.log('[MeetingAI] Extracting from', notes.length, 'chars. Members:', memberNames);

  const membersHint = memberNames.length > 0
    ? `\nProject members available for assignment: ${memberNames.join(', ')}`
    : '';

  const messages = [
    {
      role: 'system',
      content: `You are an expert AI meeting analyst for SmartOps, an enterprise project management platform.

TODAY IS: ${TODAY_STR()}
${membersHint}

Your ONLY job: analyze the meeting notes and extract ALL actionable items, commitments, responsibilities, follow-ups, and tasks.

EXTRACTION RULES:
1. title: Short, clear task name (3-7 words). Use imperative form. Remove filler words.
2. description: 1-2 sentence context about what needs to be done and why.
3. assigneeName: Full or partial name of the person responsible. Match to project members when possible. Return null if no owner mentioned.
4. priority: "LOW", "MEDIUM", or "HIGH". Infer from urgency words ("urgent", "critical", "ASAP" = HIGH; "when possible", "low priority" = LOW; default = MEDIUM).
5. deadline: Exact date expression from notes (e.g. "Friday", "Monday", "end of week", "2026-06-01"). Return null if not mentioned.
6. confidence: Float 0.0-1.0 — how confident you are this is a real action item (not just discussion/context).

DETECT:
- Direct assignments: "X will do Y by Z"
- Implicit tasks: "We need to...", "Someone should...", "Let's make sure..."
- Follow-ups: "Circle back on...", "Check with...", "Review..."
- Commitments: "I'll handle...", "I'll take care of..."

IGNORE: Pure discussion, background context, decisions without actions.

RESPOND ONLY WITH THIS EXACT JSON (no markdown, no explanation):
{
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "assigneeName": "string or null",
      "priority": "LOW|MEDIUM|HIGH",
      "deadline": "date expression or null",
      "confidence": 0.0-1.0
    }
  ],
  "summary": "1-sentence summary of the meeting",
  "totalActionItems": number
}`
    },
    {
      role: 'user',
      content: `Meeting Notes:\n\n${notes}`
    }
  ];

  let rawResponse = null;
  try {
    rawResponse = await askGroqChat(messages, { temperature: 0.15, maxTokens: 2048 });
    console.log('[MeetingAI] Raw Groq response length:', rawResponse?.length);

    const parsed = extractJSON(rawResponse);

    if (!parsed?.tasks || !Array.isArray(parsed.tasks)) {
      console.warn('[MeetingAI] No tasks array in response, using fallback');
      return { tasks: [], summary: 'Could not parse meeting notes.', totalActionItems: 0 };
    }

    const tasks = parsed.tasks
      .map(normalizeTask)
      .filter(t => t.confidence >= 0.4); // Filter very low-confidence items

    console.log('[MeetingAI] Extracted', tasks.length, 'tasks from', parsed.tasks.length, 'candidates');

    return {
      tasks,
      summary:          parsed.summary || '',
      totalActionItems: parsed.totalActionItems || tasks.length,
    };

  } catch (error) {
    console.error('[MeetingAI] Groq extraction failed:', error.message);
    console.error('[MeetingAI] Raw response:', rawResponse?.slice(0, 500));
    return { tasks: [], summary: 'AI parsing failed. Please try again.', totalActionItems: 0 };
  }
}
