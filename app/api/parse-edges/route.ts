import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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
10. Return at most 30 edges total — prioritize the most educationally valuable relationships.
11. Return ONLY raw JSON with no markdown fences, no explanation, no extra text.

NODES:
${JSON.stringify(allNodes)}

EXISTING EDGES (do not recreate these):
${JSON.stringify(existingEdges)}

FOCUS NODES (prioritize relationships involving these IDs):
${JSON.stringify(focusNodeIds)}

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

// Attempt to recover a truncated JSON array of edges
function recoverTruncatedEdges(text: string): string {
  const stripped = stripFences(text);
  const lastComplete = stripped.lastIndexOf('},');
  if (lastComplete === -1) {
    // Try single edge
    const singleEnd = stripped.lastIndexOf('}');
    if (singleEnd === -1) return '{"newEdges":[]}';
    return '{"newEdges":[' + stripped.slice(stripped.indexOf('{'), singleEnd + 1) + ']}';
  }
  const edgesStart = stripped.indexOf('[');
  if (edgesStart === -1) return '{"newEdges":[]}';
  return '{"newEdges":' + stripped.slice(edgesStart, lastComplete + 1) + ']}';
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

    // Send only compact fields to save input tokens — label + domain enough for relationship reasoning
    const compactNodes = (allNodes as Array<{ id: string; label: string; domain: string; definition?: string }>)
      .map(n => ({ id: n.id, label: n.label, domain: n.domain }));

    // Send only source/target/type for existing edges — no need for full edge objects
    const compactExistingEdges = (existingEdges as Array<{ source: string; target: string; type: string }>)
      .map(e => ({
        source: typeof e.source === 'object' ? (e.source as { id: string }).id : e.source,
        target: typeof e.target === 'object' ? (e.target as { id: string }).id : e.target,
        type: e.type,
      }));

    const systemPrompt = buildSystemPrompt(compactNodes, compactExistingEdges, focusNodeIds);

    const callAI = async (extra = '') => {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
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
      // Try to recover truncated JSON first
      try {
        parsed = JSON.parse(recoverTruncatedEdges(rawText));
      } catch {
        rawText = await callAI(
          '\n\nReturn ONLY raw JSON with no markdown fences. Max 30 edges.'
        );
        try {
          parsed = JSON.parse(stripFences(rawText));
        } catch {
          try {
            parsed = JSON.parse(recoverTruncatedEdges(rawText));
          } catch {
            console.error('parse-edges: failed to parse. Raw:', rawText.slice(0, 500));
            return NextResponse.json({ newEdges: [] }); // Graceful: return empty not 422
          }
        }
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
