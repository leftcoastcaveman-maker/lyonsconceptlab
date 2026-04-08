export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to Vercel Environment Variables.' });

  const { format, i1, i2, i3, lyons, outcome } = req.body;
  const lyonsLine = lyons ? `- Featured Lyons Magnus product: "${lyons}" — reference by name in Build steps and recipe notes.` : '';

  const ingredientLines = [
    i1 ? `- Trending Ingredient 1: ${i1}` : null,
    i2 ? `- Trending Ingredient 2: ${i2}` : null,
    i3 ? `- Trending Ingredient 3: ${i3}` : null,
  ].filter(Boolean).join('\n');

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2200,
        system: 'You are a senior foodservice innovation strategist. Respond ONLY with a raw valid JSON object — no markdown, no code fences, no text outside the JSON.',
        messages: [{
          role: 'user',
          content: `Generate a beverage/dessert innovation white paper for:
- Format: ${format}
${ingredientLines}
${lyonsLine}
- Business Outcome: ${outcome}

Use 2023-2025 consumer data (Mintel, Datassential, Technomic). Return ONLY this JSON:
{
  "conceptName": "2-5 word title in Title Case",
  "tagline": "punchy tagline under 10 words",
  "visualTheme": {
    "title": "Visual Theme",
    "content": "3-4 sentences: color palette, vessel, plating, garnish, social media appeal, tie to business outcome."
  },
  "build": {
    "title": "Build",
    "steps": ["step1","step2","step3","step4","step5"],
    "notes": "prep tips; name Lyons product if specified."
  },
  "whyItWorks": {
    "title": "Why It Works",
    "content": "4-5 sentences with specific 2023-2025 data points from Mintel, Datassential, or Technomic."
  },
  "revenueImpact": {
    "title": "Estimated Revenue Impact",
    "suggestedRetailPrice": "$X.XX",
    "cogPercent": "XX%",
    "checkImpactPercent": "XX%",
    "beverageCategoryShareIncrease": "XX%",
    "weeklyUnitsEstimate": "XXX-XXX",
    "annualRevenueEstimate": "$XX,XXX-$XX,XXX",
    "content": "3-4 sentences referencing category ASP benchmarks (Cold Brew $6.50, Shakes $5-7, Lemonade $3.50, Mocktails $6-9, Refreshers $4-6)."
  },
  "imagePrompt": "Photorealistic professional food photography. Describe exactly: the drink or dessert appearance, colors, layers, textures. The specific vessel (e.g. tall clear glass, ceramic mug, wide bowl). All garnishes and toppings in precise detail. Background and surface (e.g. white marble countertop, dark wood). Lighting (e.g. soft natural side light, bright studio). Style: commercial beverage photography, sharp focus, vibrant, appetizing, high-end restaurant quality. No text or logos. Under 120 words."
}`
        }]
      })
    });

    if (!claudeRes.ok) {
      const e = await claudeRes.json().catch(() => ({}));
      return res.status(claudeRes.status).json({ error: e.error?.message || `Claude API error ${claudeRes.status}` });
    }

    const claudeData = await claudeRes.json();
    const text = (claudeData.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    if (!text.trim()) return res.status(500).json({ error: 'Empty response from Claude. Please try again.' });

    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const s = cleaned.indexOf('{'), e2 = cleaned.lastIndexOf('}');
    if (s < 0 || e2 < 0) return res.status(500).json({ error: 'Could not parse Claude response. Please try again.' });

    return res.status(200).json(JSON.parse(cleaned.slice(s, e2 + 1)));

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
