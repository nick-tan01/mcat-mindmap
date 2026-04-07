import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are an MCAT concept extraction engine. Analyze the provided study text and extract discrete, testable MCAT concepts as structured JSON.

STRICT RULES:
1. Only extract concepts explicitly present in the provided text.
2. DO NOT recreate any concept already in the EXISTING NODES list. Check both label and aliases for duplicates.
3. Each concept must be a single, nameable MCAT topic — not a sentence, not a vague idea.
4. Assign each concept to exactly one domain from: Social Psychology, Cognition, Biology, Biochemistry, Behavioral Science, Sociology, Research Methods, Other
5. Set ai_confidence between 0.7 and 1.0 based on how clearly the text defines the concept.
6. sourceSnippet must be a verbatim excerpt of max 150 characters from the input text.
7. Generate node IDs as "node_" + zero-padded 3-digit number, continuing from the highest existing ID number (e.g., if highest existing is node_008, start new nodes at node_009).
8. aliases must include common abbreviations, alternative names, and likely misspellings. Keep aliases array short (2-3 items max).
9. Initialize quiz field as: { "easinessFactor": 2.5, "interval": 1, "repetitions": 0, "nextReviewDate": null, "lastReviewDate": null }
10. Set mastery to "unreviewed" for all new nodes.
11. Set origin to "ai-generated" for all new nodes.
12. If an existing node could be enriched by the new text (better definition, new alias), include it in updatedNodes.
13. Extract at most 25 concepts per call — prioritize the most distinct and testable ones.
14. Keep definitions concise: 1-2 sentences maximum.
15. Return ONLY raw JSON with no markdown fences, no explanation, no extra text.

OUTPUT FORMAT:
{
  "newNodes": [ ...GraphNode objects... ],
  "updatedNodes": [ { "id": "node_xxx", "updates": { ... } } ]
}`;

async function callAI(userMessage: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type');
  return block.text;
}

function stripFences(text: string): string {
  return text
    .replace(/^```json?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

// Attempt to recover a truncated JSON array by finding the last complete object
function recoverTruncatedJSON(text: string): string {
  const stripped = stripFences(text);
  // Try to find the last complete }] or closing the newNodes array
  const lastCompleteNode = stripped.lastIndexOf('},');
  if (lastCompleteNode === -1) return stripped;
  // Close the array and object cleanly
  const recovered = stripped.slice(0, lastCompleteNode + 1) + '],"updatedNodes":[]}';
  return recovered;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, existingNodes = [] } = body;

    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Input text must be at least 20 characters.' },
        { status: 400 }
      );
    }

    const existingIds = new Set<string>(existingNodes.map((n: { id: string }) => n.id));

    // Send only compact fields needed for deduplication — saves input tokens
    const compactExisting = existingNodes.map((n: { id: string; label: string; aliases: string[] }) => ({
      id: n.id,
      label: n.label,
      aliases: n.aliases,
    }));

    const userMessage = `EXISTING NODES (do not recreate these):
${JSON.stringify(compactExisting)}

NEW TEXT TO ANALYZE:
${text}`;

    let rawText = await callAI(userMessage);
    let parsed: { newNodes: unknown[]; updatedNodes: unknown[] } | null = null;

    try {
      parsed = JSON.parse(stripFences(rawText));
    } catch {
      // Try to recover truncated JSON first
      try {
        parsed = JSON.parse(recoverTruncatedJSON(rawText));
      } catch {
        // Retry with correction prompt
        rawText = await callAI(
          userMessage + '\n\nReturn ONLY raw JSON with no markdown fences. Be concise — max 25 nodes, 1-2 sentence definitions.'
        );
        try {
          parsed = JSON.parse(stripFences(rawText));
        } catch {
          try {
            parsed = JSON.parse(recoverTruncatedJSON(rawText));
          } catch {
            console.error('parse-nodes: failed to parse. Raw:', rawText.slice(0, 500));
            return NextResponse.json(
              { error: 'AI returned invalid JSON after retry.' },
              { status: 422 }
            );
          }
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.newNodes)) {
      return NextResponse.json(
        { error: 'AI response missing newNodes array.' },
        { status: 422 }
      );
    }

    // Validate no ID collisions
    for (const node of parsed.newNodes as Array<{ id: string }>) {
      if (existingIds.has(node.id)) {
        return NextResponse.json(
          { error: `AI returned duplicate node ID: ${node.id}` },
          { status: 422 }
        );
      }
    }

    return NextResponse.json({
      newNodes: parsed.newNodes,
      updatedNodes: parsed.updatedNodes || [],
    });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status === 429 || (error.status && error.status >= 500)) {
      return NextResponse.json(
        { error: error.message || 'Anthropic API error' },
        { status: 502 }
      );
    }
    console.error('parse-nodes error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
