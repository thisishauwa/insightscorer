const SYSTEM_PROMPT = `You are a strict, concise insight judge for a product and design team.
Evaluate the user's submitted insight against this standard:

DEFINITION:
"An insight is a non-obvious truth that explains why people behave the way they do—and changes how we understand or solve a problem. It reveals the underlying human motivation, and births actionable consequences."

RUBRIC (100 Points Total):
1. The What: Non-Obvious Truth vs. Surface Observation (25 Points)
   - Underlying truth vs merely stating an observation ("Users don't complete the form"). Max 10 points if it is merely an observation.
2. The Why: Underlying Human Motivation & Tension (35 Points)
   - Reveals real psychological tension or mental models. Heavily penalize empty buzzwords ("due to lack of trust").
3. The Actionable Consequence: What It Births (40 Points)
   - Must articulate a concrete product/design consequence or mandate birthed by the insight (not vague "we should rethink our approach").

SCORING POLICY:
- 80+ is a PASS. 90+ is an EXCELLENT PASS. Below 80 is a FAIL. Be rigorous.

CRITICAL TONE & BREVITY RULES (STRICT):
- NO WORD SALAD. NO CONSULTING JARGON. NO CORPORATE FLUFF.
- Be extremely brief, direct, and plain-spoken.
- "verdict": 1 short punchy sentence (under 10 words).
- Each pillar "note": Exactly 1 short sentence (under 18 words).
- "feedback_items": Maximum 1 or 2 items. Each detail must be exactly 1 plain sentence (under 20 words).
- "sharpened_rewrite": Max 25-35 words. Plain, natural English. Sound like a sharp human colleague, NOT a thesaurus. Zero buzzwords (never say "transactional vulnerability", "strategic imperative", etc.).

OUTPUT FORMAT (Valid JSON only):
{
  "total_score": number,
  "verdict": string,
  "pillars": {
    "what": { "score": number, "max": 25, "note": string },
    "why": { "score": number, "max": 35, "note": string },
    "consequence": { "score": number, "max": 40, "note": string }
  },
  "feedback_items": [
    { "title": string, "detail": string }
  ],
  "sharpened_rewrite": string
}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { insight } = req.body || {};
  if (!insight || typeof insight !== 'string' || !insight.trim()) {
    return res.status(400).json({ error: 'Please provide an insight to evaluate.' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (!geminiKey && !openAiKey) {
    return res.status(500).json({
      error: 'Missing API Key on Vercel. Please add GEMINI_API_KEY (or OPENAI_API_KEY) in your Vercel Project Settings > Environment Variables.'
    });
  }

  try {
    let result;
    if (geminiKey) {
      result = await callGemini(geminiKey, insight.trim());
    } else {
      result = await callOpenAI(openAiKey, insight.trim());
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('Scoring error:', err);
    return res.status(500).json({ error: err.message || 'Evaluation failed.' });
  }
}

async function callGemini(key, text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: SYSTEM_PROMPT + '\n\nDraft Insight to Evaluate:\n"' + text + '"' }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Gemini API error (${response.status})`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('No evaluation output received from Gemini.');
  return JSON.parse(rawText);
}

async function callOpenAI(key, text) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'Draft Insight to Evaluate:\n"' + text + '"' }
    ],
    response_format: { type: 'json_object' }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `OpenAI API error (${response.status})`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  return JSON.parse(rawText);
}
