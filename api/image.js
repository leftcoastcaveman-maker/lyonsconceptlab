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
    // Use fal.ai's synchronous run endpoint for fast response
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
      })
    });

    if (!falRes.ok) {
      const e = await falRes.json().catch(() => ({}));
      return res.status(falRes.status).json({ error: e.message || `fal.ai error ${falRes.status}` });
    }

    const data = await falRes.json();
    const imageUrl = data.images?.[0]?.url || null;

    if (!imageUrl) {
      return res.status(500).json({ error: 'No image returned from fal.ai. Please try again.' });
    }

    return res.status(200).json({ imageUrl });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Image generation failed.' });
  }
}
