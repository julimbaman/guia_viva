import { Router } from 'express';
import OpenAI from 'openai';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const {
      transport_mode,
      speed,
      cardinal_direction,
      poi_name,
      poi_type,
      distance,
      relative_direction,
      editorial_summary,
      rating,
      num_reviews,
      is_open,
      time,
      zone_name,
      recent_history,
      max_sentences = 3,
      question // Optional question from user
    } = req.body;

    const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      res.status(500).json({ error: 'Missing AI API Key' });
      return;
    }

    // Use OpenAI if OPENAI_API_KEY is provided, otherwise fallback to Gemini via OpenAI compatibility layer
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY,
      ...(process.env.OPENAI_API_KEY ? {} : { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' })
    });

    const model = process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-4o') : 'gemini-2.5-pro';

    let systemPrompt = `You are an expert, passionate, and conversational tour guide who speaks in Colombian Spanish.
The user is currently ${transport_mode} at ${speed} km/h, heading ${cardinal_direction}.

A point of interest has been detected:
- Name: ${poi_name}
- Type: ${poi_type}
- Distance: ${distance} meters ${relative_direction}
- Google description: ${editorial_summary}
- Rating: ${rating}/5 (${num_reviews} reviews)
- Open right now: ${is_open}

Additional context:
- Local time: ${time}
- Current zone: ${zone_name}
- Last 5 narrated places: ${recent_history}

Generate a narration that:
1. Mentions the relative direction of the place at the beginning
2. Includes ONE non-obvious historical, cultural, or quirky fact
3. Is conversational, as if talking to a friend
4. Does NOT repeat information from the places listed in recent history
5. If the place is currently closed, briefly mention it at the end
6. IMPORTANT LENGTH RULE: If the place is historical, cultural, or a museum, provide a slightly longer, more detailed explanation (3-4 sentences). Otherwise, keep it to a maximum of ${max_sentences} sentences.

Respond with ONLY the narration text. No quotes, no markdown, no formatting.`;

    let messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    if (question) {
      messages.push({ role: 'user', content: `The user asked a question: "${question}". Answer it concisely in character as the tour guide, focusing on the POI or the area.` });
    } else {
      messages.push({ role: 'user', content: `Generate the narration for ${poi_name}.` });
    }

    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.7,
    });

    const narration = completion.choices[0]?.message?.content?.trim() || '';

    res.json({ narration });
  } catch (error) {
    console.error('Narrate route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
