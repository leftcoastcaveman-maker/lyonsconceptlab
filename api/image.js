export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const falKey = process.env.FAL_API_KEY;
  if (!falKey) return res.status(500).json({ error: 'FAL_API_KEY not configured in Vercel Environment Variables.' });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No image prompt provided.' });

  try {
    // fal.ai REST API — correct endpoint and payload structure
    const falRes = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${falKey}`,
      },
      body: JSON.stringify({
        prompt: prompt,
        image_size: 'square_hd',
        num_inference_steps: 8,
        num_images: 1,
        enable_safety_checker: true,
        sync_mode: true,
      })
    });

    // Capture raw response text first so we can debug if needed
    const rawText = await falRes.text();

    if (!falRes.ok) {
      // Return the actual fal.ai error so we can see what went wrong
      return res.status(falRes.status).json({
        error: `fal.ai error ${falRes.status}`,
        detail: rawText.slice(0, 500)
      });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(500).json({ error: 'Could not parse fal.ai response', detail: rawText.slice(0, 300) });
    }

    // fal.ai returns images array
    const imageUrl = data?.images?.[0]?.url || data?.image?.url || null;

    if (!imageUrl) {
      return res.status(500).json({
        error: 'No image URL in fal.ai response',
        detail: JSON.stringify(data).slice(0, 300)
      });
    }

    return res.status(200).json({ imageUrl });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Image generation failed.' });
  }
}
