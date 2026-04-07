import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystemPrompt(
  allNodes: unknown[],
  existingEdges: unknown[],
  focusNodeIds: string[]
): string {
  return `You are an MCAT relationship extraction engine. Given a list of MCAT concepts, identify meaningful conceptual relationships between them for a knowledge graph.

STRICT RULES:
1. Only use node IDs from the provided NODES list. Never invent node IDs.
2. DO NOT recreate any relationship already in the EXISTING EDGES list.
3. Prioritize relationships that involve the FOCUS NODES.
4. Each relationship must be academically meaningful for MCAT study — a student would benefit from knowing this connection.
5. Use ONLY these relationship types: contrasts_with, is_a_type_of, commonly_confused_with, mechanism_overlap, real_world_example_of, causes, part_of
6. source must not equal target (no self-loops).
7. Avoid redundant pairs: if A→B of type X exists, do not create B→A of type X.
8. Set origin to "ai-generated" for all edges.
9. Generate edge IDs as "edge_" + zero-padded 3-digit number, continuing from the highest existing edge ID.
10. Return ONLY raw JSON with no markdown fences, no explanation, no extra text.

NODES:
${JSON.stringify(allNodes, null, 2)}

EXISTING EDGES (do not recreate these):
${JSON.stringify(existingEdges, null, 2)}

FOCUS NODES (prioritize relationships involving these IDs):
${JSON.stringify(focusNodeIds, null, 2)}

OUTPUT FORMAT:
{
  "newEdges": [
    {
      "id": "edge_XXX",
      "source": "node_id",
      "target": "node_id",
      "type": "contrasts_with",
      "label": "contrasts with",
      "origin": "ai-generated"
    }
  ]
}`;
}

function stripFences(text: string): string {
  return text
    .replace(/^```json?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { allNodes = [], existingEdges = [], focusNodeIds = [] } = body;

    if (!Array.isArray(allNodes) || allNodes.length === 0) {
      return NextResponse.json({ newEdges: [] });
    }

    const validNodeIds = new Set<string>(
      (allNodes as Array<{ id: string }>).map(n => n.id)
    );

    const systemPrompt = buildSystemPrompt(allNodes, existingEdges, focusNodeIds);

    const callAI = async (extra = '') => {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: 'Extract relationships as specified.' + extra,
        }],
        system: systemPrompt,
      });
      const block = response.content[0];
      if (block.type !== 'text') throw new Error('Unexpected response type');
      return block.text;
    };

    let rawText = await callAI();
    let parsed: { newEdges: unknown[] } | null = null;

    try {
      parsed = JSON.parse(stripFences(rawText));
    } catch {
      rawText = await callAI(
        '\n\nYour previous response was not valid JSON. Return ONLY raw JSON with no markdown fences.'
      );
      try {
        parsed = JSON.parse(stripFences(rawText));
      } catch {
        return NextResponse.json(
          { error: 'AI returned invalid JSON after retry.' },
          { status: 422 }
        );
      }
    }

    if (!parsed || !Array.isArray(parsed.newEdges)) {
      return NextResponse.json({ newEdges: [] });
    }

    // Validate all source/target IDs exist
    const validEdges = (parsed.newEdges as Array<{ source: string; target: string }>).filter(
      e => validNodeIds.has(e.source) && validNodeIds.has(e.target)
    );

    return NextResponse.json({ newEdges: validEdges });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status === 429 || (error.status && error.status >= 500)) {
      return NextResponse.json(
        { error: error.message || 'Anthropic API error' },
        { status: 502 }
      );
    }
    console.error('parse-edges error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
