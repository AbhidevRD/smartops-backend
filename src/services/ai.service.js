import axios from 'axios';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile'; // Supports system prompts, fast, reliable
const MAX_RETRIES = 1; // Reduced for faster fallback
const TIMEOUT = 25000; // 25 seconds

/**
 * Ask Groq API with retry and timeout handling
 * @param {string} prompt - The prompt to send
 * @param {object} options - Optional config (retries, timeout, temperature, maxTokens)
 * @returns {Promise<string>} - AI response
 */
export async function askGroq(prompt, options = {}) {
  const { 
    retries = MAX_RETRIES, 
    timeout = TIMEOUT,
    temperature = 0.7,
    maxTokens = 1024
  } = options;

  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt must be a non-empty string');
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured in environment');
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        GROQ_API_URL,
        {
          model: MODEL,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature,
          max_tokens: maxTokens,
          top_p: 1
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout
        }
      );

      if (!response.data?.choices?.[0]?.message?.content) {
        throw new Error('Invalid Groq API response format');
      }

      const content = response.data.choices[0].message.content;
      console.log('[Groq API] Response received:', { 
        length: content.length, 
        attempt: attempt + 1 
      });
      
      return content;

    } catch (error) {
      const isLastAttempt = attempt === retries;
      console.error(`[Groq API Error - Attempt ${attempt + 1}/${retries + 1}]:`, {
        message: error.message,
        status: error.response?.status,
        code: error.code,
        groqError: error.response?.data?.error || null,
        isLastAttempt
      });

      if (isLastAttempt) {
        throw new Error(`Groq API failed after ${retries + 1} attempts: ${error.message}`);
      }

      // Exponential backoff: 1s, 2s, etc.
      const delayMs = 1000 * (attempt + 1);
      console.log(`[Groq API] Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Extract JSON from text response
 * Handles LLM responses that may include extra text before/after JSON
 * @param {string} text - Text containing JSON
 * @returns {object|array} - Parsed JSON object or array
 */
export function extractJSON(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: expected string');
  }

  try {
    // Try direct parse first
    return JSON.parse(text.trim());
  } catch (e) {
    // Try to find JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        // Continue to array attempt
      }
    }

    // Try array format
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (e3) {
        // Continue to detailed error
      }
    }

    throw new Error(
      `Failed to extract JSON from response. Text length: ${text.length}, ` +
      `Preview: ${text.substring(0, 150)}...`
    );
  }
}

/**
 * Safely ask Groq and extract JSON from response
 * @param {string} prompt - The prompt to send
 * @param {object} options - Optional config
 * @returns {Promise<object|array>} - Parsed JSON
 */
export async function askGroqJSON(prompt, options = {}) {
  try {
    const response = await askGroq(prompt, options);
    const parsed = extractJSON(response);
    console.log('[askGroqJSON] Successfully extracted JSON');
    return parsed;
  } catch (error) {
    console.error('[askGroqJSON] Failed:', error.message);
    throw error;
  }
}

/**
 * Ask Groq with JSON schema enforcement (stricter)
 * Enforces that response is valid JSON
 * @param {string} prompt - The prompt to send
 * @param {object} schema - Optional JSON schema hint
 * @returns {Promise<object>} - Validated JSON response
 */
export async function askGroqWithSchema(prompt, schema = null) {
  // Add explicit JSON instruction to prompt
  const enhancedPrompt = `${prompt}

IMPORTANT: You MUST respond with ONLY valid JSON, nothing else. No markdown, no explanation.`;

  const response = await askGroq(enhancedPrompt);
  return extractJSON(response);
}

/**
 * Ask Groq using a full messages array (system + user separation)
 * This is critical for the AI chat feature where we need strong system-level instructions
 * separate from the user's question.
 * @param {Array<{role: string, content: string}>} messages - Chat messages array
 * @param {object} options - Optional config (retries, timeout, temperature, maxTokens)
 * @returns {Promise<string>} - AI response text
 */
export async function askGroqChat(messages, options = {}) {
  const {
    retries = MAX_RETRIES,
    timeout = TIMEOUT,
    temperature = 0.3,
    maxTokens = 1024
  } = options;

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Messages must be a non-empty array');
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured in environment');
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        GROQ_API_URL,
        {
          model: MODEL,
          messages,
          temperature,
          max_tokens: maxTokens,
          top_p: 1
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout
        }
      );

      if (!response.data?.choices?.[0]?.message?.content) {
        throw new Error('Invalid Groq API response format');
      }

      const content = response.data.choices[0].message.content;
      console.log('[Groq Chat API] Response received:', {
        length: content.length,
        attempt: attempt + 1
      });

      return content;

    } catch (error) {
      const isLastAttempt = attempt === retries;
      console.error(`[Groq Chat API Error - Attempt ${attempt + 1}/${retries + 1}]:`, {
        message: error.message,
        status: error.response?.status,
        code: error.code,
        groqError: error.response?.data?.error || null,
        isLastAttempt
      });

      if (isLastAttempt) {
        throw new Error(`Groq Chat API failed after ${retries + 1} attempts: ${error.message}`);
      }

      const delayMs = 1000 * (attempt + 1);
      console.log(`[Groq Chat API] Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}