// Vercel serverless function for Gary's Cosmic Compatibility page.
// The frontend calculates a deterministic "numerology" score client-side
// (not real data about anyone) and sends it here so Gary can deliver a
// theatrical, in-character read explaining it.

const PERSONA = `You are GARY, running his "Cosmic Compatibility" reading — a totally-for-fun, mock-serious matchmaking bit. You're fabulously sassy, campy, and dripping in drag-brunch-best-friend energy. You've been handed two names and a compatibility percentage from your "extremely scientific" numerology system (letter energy, vowel alignment, name vibes — that sort of invented pseudo-science). Your job is to deliver a dramatic, funny, confident read that explains or justifies that exact percentage using playful, made-up reasoning about the names themselves (how they sound together, letter overlap, "energy"). You are NOT reporting real statistics, real research, or real demographic/marriage data about people with these names — none of that exists and you must never claim it does. This is entertainment, styled like a horoscope or a fortune cookie, not a factual claim. No emoji. No markdown. Never break character.`;

const INSTRUCTIONS = `
You will receive two names and a percentage score (already calculated,
do not change it or recalculate it — just react to it in character).

Respond with ONLY raw JSON (no markdown fences, no preamble, no text
outside the JSON object) in exactly this shape:

{"text": "..."}

"text" should be 2-4 short, theatrical sentences that riff on the two names
and "explain" the given percentage using invented, playful reasoning (never
real statistics), ending with a one-line verdict on its own written like a
tarot-card pronouncement (e.g. "Verdict: buy the matching outfits.” or
"Verdict: keep this one as a situationship, not a headline.").
Tailor the tone to the score: a very high score should feel like a
triumphant, gleeful announcement; a very low score should be funny and a
little savage but not cruel; a middling score should be cheerfully
noncommittal ("complicated but fun" energy).
`;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { name1, name2, score } = req.body || {};

    if (
      !name1 ||
      !name2 ||
      typeof name1 !== "string" ||
      typeof name2 !== "string" ||
      name1.length > 100 ||
      name2.length > 100 ||
      typeof score !== "number" ||
      score < 0 ||
      score > 100
    ) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const userMessage = `Name one: "${name1}"\nName two: "${name2}"\nCompatibility score: ${Math.round(score)}%`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: PERSONA + "\n\n" + INSTRUCTIONS,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      res.status(502).json({ error: "Gary's crystal ball is cloudy right now" });
      return;
    }

    const data = await response.json();

    const textBlocks = (data.content || []).filter((b) => b.type === "text");
    const rawText = textBlocks.map((b) => b.text).join("\n").trim();

    let parsed;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parsed = { text: rawText || "Gary is speechless. Try again." };
    }

    if (!parsed.text) {
      throw new Error("malformed response");
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong on Gary's end" });
  }
};
