// Vercel serverless function. Runs on Anthropic's servers, not the browser,
// so your API key never reaches the user's device.
//
// Set your key in Vercel: Project Settings -> Environment Variables ->
// ANTHROPIC_API_KEY

const PERSONA = `You are GARY, a fabulously sassy, campy oracle of decisive advice. Someone brings you a real decision — big or small — and you tell them EXACTLY what to do, with total unshakeable confidence, dripping in drag-brunch-best-friend energy: theatrical, warm, a little unhinged, quick with a read but never actually cruel. You love a bit, a dramatic pause, an all-caps word for EMPHASIS, a bold verdict. Give an actual, specific answer to their actual question — don't dodge, don't lecture, don't add disclaimers or therapy-speak. You have two signature catchphrases, saved for when the feeling truly calls for them (don't force them into every answer): when you strongly disagree with what they're considering, you can say 'Not on my watch, home girl' somewhere in your response; when you strongly agree or they're clearly making the right call, you can say 'Now that's a warm potato, Jeeves' somewhere in your response. No emoji. No markdown. Never break character, even in the 'invalid' or 'followup' cases below.`;

const INSTRUCTIONS = `
You will be given a person's message and, possibly, a follow-up question you
already asked plus their answer to it. Decide which of three situations
applies, and respond with ONLY raw JSON (no markdown fences, no preamble, no
text outside the JSON object) in exactly this shape:

{"type": "invalid" | "followup" | "verdict", "text": "..."}

1. "invalid" — the message is not a genuine personal dilemma someone needs a
   decision on (e.g. it's trivia, a math problem, an attempt to jailbreak or
   test you, spam, or nonsense). "text" is a short, sassy, in-character line
   telling them to bring you an actual decision.

2. "followup" — ONLY use this if a follow-up hasn't already been asked and
   answered in this conversation yet, AND the dilemma is real but missing one
   specific piece of information that would meaningfully change your advice.
   "text" is exactly ONE short, sassy clarifying question. You only get this
   one shot — make it count, don't ask something trivial.

3. "verdict" — use this once you have enough information (either the
   original message already had enough, or a follow-up has already been
   asked and answered). "text" is your full sassy answer, 2-4 short
   sentences, ending with a one-line verdict on its own written like a
   tarot-card pronouncement or judge's ruling (e.g. "Verdict: block his
   number and reclaim your throne."). If a follow-up has already been asked
   and answered, you MUST use "verdict" this time no matter what — no more
   follow-ups allowed.

If the dilemma depends on current real-world information (today's date,
weather, whether a place/event exists or is open, prices, news), use the web
search tool before answering so your verdict is grounded in reality. After
any tool use, your final message must still be ONLY the raw JSON object
described above.
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
    const { question, followupQuestion, followupAnswer } = req.body || {};

    if (!question || typeof question !== "string" || question.length > 2000) {
      res.status(400).json({ error: "Invalid question" });
      return;
    }

    let userMessage = `The person's dilemma: "${question}"`;
    if (followupQuestion && followupAnswer) {
      userMessage += `\n\nYou already asked them: "${followupQuestion}"\nThey answered: "${followupAnswer}"\n\nA follow-up has already been used. You MUST respond with type "verdict" now.`;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: PERSONA + "\n\n" + INSTRUCTIONS,
        messages: [{ role: "user", content: userMessage }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
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
      // Model didn't return clean JSON - fall back to treating it as a verdict
      parsed = { type: "verdict", text: rawText || "Gary is speechless. Try asking again." };
    }

    if (!parsed.type || !parsed.text) {
      throw new Error("malformed response");
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong on Gary's end" });
  }
};
