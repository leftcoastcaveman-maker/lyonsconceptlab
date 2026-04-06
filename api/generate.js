export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to Vercel Environment Variables.' });

  const { format, i1, i2, i3, lyons, outcome } = req.body;
  const lyonsLine = lyons ? `- Featured Lyons Magnus product: "${lyons}" — reference by name in Build steps and recipe notes.` : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: 'You are a senior foodservice innovation strategist. Respond ONLY with a raw valid JSON object — no markdown, no code fences, no text outside the JSON.',
        messages: [{
          role: 'user',
          content: `Generate a beverage/dessert innovation white paper for:
- Format: ${format}
- Trending Ingredient 1: ${i1}
- Trending Ingredient 2: ${i2}
- Trending Ingredient 3: ${i3}
${lyonsLine}
- Business Outcome: ${outcome}

Use 2023-2025 consumer data (Mintel, Datassential, Technomic). Return ONLY this JSON:
{"conceptName":"2-5 word title in Title Case","tagline":"punchy tagline under 10 words","visualTheme":{"title":"Visual Theme","content":"3-4 sentences: color palette, vessel, plating, garnish, social media appeal, tie to business outcome."},"build":{"title":"Build","steps":["step1","step2","step3","step4","step5"],"notes":"prep tips; name Lyons product if specified."},"whyItWorks":{"title":"Why It Works","content":"4-5 sentences with specific 2023-2025 data points from Mintel, Datassential, or Technomic."},"revenueImpact":{"title":"Estimated Revenue Impact","suggestedRetailPrice":"$X.XX","cogPercent":"XX%","checkImpactPercent":"XX%","beverageCategoryShareIncrease":"XX%","weeklyUnitsEstimate":"XXX-XXX","annualRevenueEstimate":"$XX,XXX-$XX,XXX","content":"3-4 sentences referencing category ASP benchmarks (Cold Brew $6.50, Shakes $5-7, Lemonade $3.50, Mocktails $6-9, Refreshers $4-6)."}}`
        }]
      })
    });

    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: e.error?.message || `Anthropic error ${response.status}` });
    }

    const data = await response.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    if (!text.trim()) return res.status(500).json({ error: 'Empty AI response. Please try again.' });

    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const s = cleaned.indexOf('{'), e2 = cleaned.lastIndexOf('}');
    if (s < 0 || e2 < 0) return res.status(500).json({ error: 'Could not parse AI response. Please try again.' });

    return res.status(200).json(JSON.parse(cleaned.slice(s, e2 + 1)));
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

