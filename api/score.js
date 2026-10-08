const SYSTEM_PROMPT = `You are an expert insight judge for a product and design team.
Evaluate the user's submitted insight against this exact standard:

DEFINITION:
"An insight is a non-obvious truth that explains why people behave the way they do—and changes how we understand or solve a problem. It reveals the underlying human motivation, and births actionable consequences."

RUBRIC (100 Points Total):
1. The What: Non-Obvious Truth vs. Surface Observation (25 Points)
   - Is this an underlying truth, or merely a surface-level observation ("Users don't complete the form", "Users click button X")?
   - Max 10 points if it is merely an observation.

2. The Why: Underlying Human Motivation & Tension (35 Points)
   - Does it reveal what is happening inside people's heads (fears, anxiety, loss of trust, perceived vulnerability, mental models)?
   - PENALIZE BUZZWORD STUFFING: If someone just inserts words like "because of lack of trust" without explaining the actual psychological friction, deduct points heavily.

3. The Actionable Consequence: What It Births (40 Points)
   - Does this insight birth a clear, concrete consequence or decision for the product, team, or strategy?
   - NOTE: It is NOT enough to say "this changes our approach" or "we should rethink things". It must articulate what concrete consequence or mandate is birthed from the insight.

SCORING POLICY:
- 80+ is a PASS.
- 90+ is an EXCELLENT PASS.
- Below 80 is a FAIL. Be rigorous. Do not give 100 unless it is truly exceptional across all 3 criteria.

OUTPUT FORMAT:
Respond with ONLY valid JSON with this exact schema:
{
  "total_score": number, // 0-100
  "verdict": string, // One-line summary
  "pillars": {
    "what": { "score": number, "max": 25, "note": string },
    "why": { "score": number, "max": 35, "note": string },
    "consequence": { "score": number, "max": 40, "note": string }
  },
  "feedback_items": [
    { "title": string, "detail": string }
  ],
  "sharpened_rewrite": string // A clear, rewritten version demonstrating how to elevate it to a 90+ insight.
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
