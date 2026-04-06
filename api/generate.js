export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const falKey = process.env.FAL_API_KEY;

  if (!anthropicKey) return res.status(500).json({ error: 'API key not configured. Add ANTHROPIC_API_KEY to Vercel Environment Variables.' });

  const { format, i1, i2, i3, lyons, outcome } = req.body;
  const lyonsLine = lyons ? `- Featured Lyons Magnus product: "${lyons}" — reference by name in Build steps and recipe notes.` : '';

  // Only include ingredients that were actually specified
  const ingredientLines = [
    i1 ? `- Trending Ingredient 1: ${i1}` : null,
    i2 ? `- Trending Ingredient 2: ${i2}` : null,
    i3 ? `- Trending Ingredient 3: ${i3}` : null,
  ].filter(Boolean).join('\n');

  // ── STEP 1: Generate white paper via Claude ──────────────────────────────
  let whitePaper;
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
  "imagePrompt": "A highly detailed prompt for photorealistic food/beverage photography of this exact concept. Describe the drink or dessert precisely including its color, layers, texture, and ingredients. Specify the vessel (glass type, cup, bowl). Describe all garnishes, toppings, and finishing touches in detail. Set the scene: surface material, background, lighting style (e.g. soft natural light, studio backlight). Style: professional food photography, commercial quality, sharp focus, vibrant colors, appetizing. Keep under 150 words."
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
    whitePaper = JSON.parse(cleaned.slice(s, e2 + 1));

  } catch (err) {
    return res.status(500).json({ error: 'Claude error: ' + (err.message || 'Unknown error') });
  }

  // ── STEP 2: Generate image via fal.ai ────────────────────────────────────
  let imageUrl = null;

  if (falKey && whitePaper.imagePrompt) {
    try {
      // Submit the image generation request
      const falSubmit = await fetch('https://queue.fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${falKey}`,
        },
        body: JSON.stringify({
          prompt: whitePaper.imagePrompt,
          image_size: 'square',
          num_inference_steps: 4,
          num_images: 1,
          enable_safety_checker: true,
        })
      });

      if (falSubmit.ok) {
        const submitData = await falSubmit.json();

        // If we got a direct result (synchronous response)
        if (submitData.images && submitData.images[0]?.url) {
          imageUrl = submitData.images[0].url;
        }
        // If queued, poll for result
        else if (submitData.request_id) {
          const requestId = submitData.request_id;
          let attempts = 0;
          while (attempts < 30) {
            await new Promise(r => setTimeout(r, 2000));
            const pollRes = await fetch(`https://queue.fal.run/fal-ai/flux/schnell/requests/${requestId}`, {
              headers: { 'Authorization': `Key ${falKey}` }
            });
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData.status === 'COMPLETED' && pollData.output?.images?.[0]?.url) {
                imageUrl = pollData.output.images[0].url;
                break;
              } else if (pollData.status === 'FAILED') {
                break;
              }
            }
            attempts++;
          }
        }
      }
    } catch (imgErr) {
      // Image generation failed silently — white paper still returns fine
      console.error('fal.ai error:', imgErr.message);
    }
  }

  // ── Return combined result ───────────────────────────────────────────────
  return res.status(200).json({
    ...whitePaper,
    imageUrl,
    imageFallback: !falKey
  });
}
