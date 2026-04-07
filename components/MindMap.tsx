'use client';

import { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { GraphData, GraphNode, GraphEdge } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/colors';

interface MindMapProps {
  graph: GraphData;
  selectedNodeId: string | null;
  highlightedNodeIds: string[];
  onNodeClick: (nodeId: string) => void;
  onBackgroundClick: () => void;
  centerOnNodeId: string | null;
}

type D3Node = GraphNode & d3.SimulationNodeDatum & {
  __dragStartX?: number;
  __dragStartY?: number;
  __dragged?: boolean;
};

type D3Edge = Omit<GraphEdge, 'source' | 'target'> & {
  source: D3Node | string;
  target: D3Node | string;
};

const EDGE_COLORS: Record<string, string> = {
  contrasts_with: '#ef4444',
  is_a_type_of: '#6366f1',
  commonly_confused_with: '#f59e0b',
  mechanism_overlap: '#8b5cf6',
  real_world_example_of: '#10b981',
  causes: '#06b6d4',
  part_of: '#64748b',
};

function nodeX(n: D3Node | string): number {
  return typeof n === 'string' ? 0 : (n.x ?? 0);
}
function nodeY(n: D3Node | string): number {
  return typeof n === 'string' ? 0 : (n.y ?? 0);
}
function nodeId(n: D3Node | string): string {
  return typeof n === 'string' ? n : n.id;
}

export default function MindMap({
  graph,
  selectedNodeId,
  highlightedNodeIds,
  onNodeClick,
  onBackgroundClick,
  centerOnNodeId,
}: MindMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3.Simulation<D3Node, D3Edge> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodesRef = useRef<D3Node[]>([]);
  const edgesRef = useRef<D3Edge[]>([]);

  // Track mouse position for the background-click gesture (handled in React, not D3)
  const bgGestureRef = useRef({ x: 0, y: 0, moved: false });

  // Design 3 — degree-based radius
  const buildDegreeMap = useCallback((nodes: GraphNode[], edges: GraphEdge[]) => {
    const map = new Map<string, number>(nodes.map(n => [n.id, 0]));
    edges.forEach(e => {
      const s = typeof e.source === 'string' ? e.source : (e.source as D3Node).id;
      const t = typeof e.target === 'string' ? e.target : (e.target as D3Node).id;
      map.set(s, (map.get(s) ?? 0) + 1);
      map.set(t, (map.get(t) ?? 0) + 1);
    });
    return map;
  }, []);

  const getRadius = useCallback((id: string, degreeMap: Map<string, number>) => {
    const deg = degreeMap.get(id) ?? 0;
    return Math.min(30, Math.max(16, 16 + deg * 1.8));
  }, []);

  const initSim = useCallback(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const { width, height } = svgRef.current.getBoundingClientRect();

    svg.selectAll('*').remove();

    const degreeMap = buildDegreeMap(graph.nodes, graph.edges);

    // ── Defs ─────────────────────────────────────────────────────────────────
    const defs = svg.append('defs');

    Object.entries(EDGE_COLORS).forEach(([type, color]) => {
      defs.append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 36)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
    });

    defs.append('filter').attr('id', 'drop-shadow')
      .append('feDropShadow')
      .attr('dx', 0).attr('dy', 0)
      .attr('stdDeviation', 6)
      .attr('flood-color', '#6366f1')
      .attr('flood-opacity', 0.9);

    // ── Containers ────────────────────────────────────────────────────────────
    const g          = svg.append('g').attr('class', 'zoom-container');
    const edgeGroup  = g.append('g').attr('class', 'edges');
    const labelGroup = g.append('g').attr('class', 'edge-labels');
    const nodeGroup  = g.append('g').attr('class', 'nodes');

    // ── Node / edge data ─────────────────────────────────────────────────────
    const newNodes: D3Node[] = graph.nodes.map(n => {
      const prev = nodesRef.current.find(p => p.id === n.id);
      return prev ? { ...n, x: prev.x, y: prev.y } : { ...n };
    });
    const newEdges: D3Edge[] = graph.edges.map(e => ({ ...e }));
    nodesRef.current = newNodes;
    edgesRef.current = newEdges;

    // ── Domain clustering — arrange domain groups around a ring ──────────────
    const domains = [...new Set(graph.nodes.map(n => n.domain))];
    const domainAngle = new Map(
      domains.map((d, i) => [d, (i / domains.length) * 2 * Math.PI - Math.PI / 2])
    );
    const clusterR = Math.min(width, height) * 0.30;

    // ── Per-node target: weighted centroid of neighbour domain anchors ────────
    // A node whose edges all stay within one domain targets the centre of that
    // domain's sector (sits deep in the cluster).
    // A node that bridges two domains targets the boundary between them.
    // A node that bridges many domains migrates toward the overall centre.
    // Own domain is double-weighted so nodes stay grounded in their cluster
    // unless cross-domain connections are dominant.
    const nodeTargetX = new Map<string, number>();
    const nodeTargetY = new Map<string, number>();

    graph.nodes.forEach(n => {
      const domainWeights = new Map<string, number>();
      domainWeights.set(n.domain, 2); // anchor to own domain

      graph.edges.forEach(e => {
        const src = typeof e.source === 'string' ? e.source : (e.source as D3Node).id;
        const tgt = typeof e.target === 'string' ? e.target : (e.target as D3Node).id;
        const neighbourId = src === n.id ? tgt : tgt === n.id ? src : null;
        if (!neighbourId) return;
        const neighbour = graph.nodes.find(nn => nn.id === neighbourId);
        if (!neighbour) return;
        domainWeights.set(neighbour.domain, (domainWeights.get(neighbour.domain) ?? 0) + 1);
      });

      let tx = 0, ty = 0, total = 0;
      domainWeights.forEach((w, domain) => {
        const angle = domainAngle.get(domain) ?? 0;
        tx += (width / 2 + Math.cos(angle) * clusterR) * w;
        ty += (height / 2 + Math.sin(angle) * clusterR) * w;
        total += w;
      });
      nodeTargetX.set(n.id, tx / total);
      nodeTargetY.set(n.id, ty / total);
    });

    // ── Simulation ────────────────────────────────────────────────────────────
    const sim = d3.forceSimulation<D3Node>(newNodes)
      .force('link',
        d3.forceLink<D3Node, D3Edge>(newEdges)
          .id(d => d.id)
          .distance(160)
          .strength(0.5)
      )
      .force('charge', d3.forceManyBody<D3Node>().strength(-500).theta(0.9))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<D3Node>(d => getRadius(d.id, degreeMap) + 12))
      .force('x', d3.forceX<D3Node>(d => nodeTargetX.get(d.id) ?? width / 2).strength(0.12))
      .force('y', d3.forceY<D3Node>(d => nodeTargetY.get(d.id) ?? height / 2).strength(0.12))
      .alphaDecay(0.028);

    simRef.current = sim;

    // ── Edges ─────────────────────────────────────────────────────────────────
    const edgeSel = edgeGroup
      .selectAll<SVGLineElement, D3Edge>('line')
      .data(newEdges, d => d.id)
      .join('line')
      .attr('stroke', d => EDGE_COLORS[d.type] || '#8888a8')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', d => `url(#arrow-${d.type})`);

    // ── Edge label badges (Design 2) ──────────────────────────────────────────
    const edgeLabelSel = labelGroup
      .selectAll<SVGGElement, D3Edge>('g.el')
      .data(newEdges, d => d.id)
      .join('g')
      .attr('class', 'el')
      .attr('opacity', 0); // hidden until zoom > 1.1

    edgeLabelSel.each(function(d) {
      const el = d3.select(this);
      const labelText = d.label || d.type.replace(/_/g, ' ');
      const lw = labelText.length * 5.5;
      const color = EDGE_COLORS[d.type] || '#8888a8';
      el.append('rect')
        .attr('x', -lw / 2 - 4).attr('y', -8)
        .attr('width', lw + 8).attr('height', 16)
        .attr('rx', 4)
        .attr('fill', '#1a1a24').attr('fill-opacity', 0.9);
      el.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 9)
        .attr('fill', color)
        .attr('pointer-events', 'none')
        .text(labelText);
    });

    // ── Nodes ─────────────────────────────────────────────────────────────────
    const nodeSel = nodeGroup
      .selectAll<SVGGElement, D3Node>('g.node')
      .data(newNodes, d => d.id)
      .join('g')
      .attr('class', 'node')
      .attr('data-node-id', d => d.id)
      .style('cursor', 'pointer');

    nodeSel.each(function(d) {
      const el = d3.select(this);
      const r = getRadius(d.id, degreeMap);

      // Mastery ring
      if (d.mastery !== 'unreviewed') {
        const ringColor =
          d.mastery === 'mastered' ? '#10b981' :
          d.mastery === 'reviewing' ? '#f59e0b' : '#ef4444';
        const ring = el.append('circle')
          .attr('class', 'mastery-ring')
          .attr('r', r + 4)
          .attr('fill', 'none')
          .attr('stroke', ringColor)
          .attr('stroke-width', 2);
        if (d.mastery !== 'mastered') ring.attr('stroke-dasharray', '4 2');
      }

      // Main circle — Design 3: radius from degree
      el.append('circle')
        .attr('class', 'main-circle')
        .attr('r', r)
        .attr('fill', DOMAIN_COLORS[d.domain] || '#94a3b8')
        .attr('stroke', '#0f0f13')
        .attr('stroke-width', 2);

      // Search highlight ring
      el.append('circle')
        .attr('class', 'highlight-ring')
        .attr('r', r + 6)
        .attr('fill', 'none')
        .attr('stroke', '#fbbf24')
        .attr('stroke-width', 3)
        .attr('opacity', 0);

      // Bug 4 — full label, wrapped to two lines for long names
      const words = d.label.split(' ');
      const textEl = el.append('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('fill', '#e8e8f0')
        .attr('pointer-events', 'none');

      if (words.length > 3) {
        const mid = Math.ceil(words.length / 2);
        textEl.append('tspan').attr('x', 0).attr('dy', r + 14).text(words.slice(0, mid).join(' '));
        textEl.append('tspan').attr('x', 0).attr('dy', 13).text(words.slice(mid).join(' '));
      } else {
        textEl.append('tspan').attr('x', 0).attr('dy', r + 14).text(d.label);
      }
    });

    // ── Drag — Bug 2: only fire click if drag distance < 5px ─────────────────
    const drag = d3.drag<SVGGElement, D3Node>()
      .on('start', function(event, d) {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        d.__dragStartX = event.x;
        d.__dragStartY = event.y;
        d.__dragged = false;
      })
      .on('drag', function(event, d) {
        const dx = event.x - (d.__dragStartX ?? event.x);
        const dy = event.y - (d.__dragStartY ?? event.y);
        if (Math.sqrt(dx * dx + dy * dy) > 5) d.__dragged = true;
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', function(event, d) {
        if (!event.active) sim.alphaTarget(0);
        if (!d.__dragged) onNodeClick(d.id); // Bug 2 — click only on non-drag
        d.fx = null;
        d.fy = null;
      });

    nodeSel.call(drag as d3.DragBehavior<SVGGElement, D3Node, D3Node | d3.SubjectPosition>);

    // ── Zoom — applied to <svg> (Bug 3: prevents event competition with drag) ─
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', event => {
        g.attr('transform', event.transform);
        edgeLabelSel.attr('opacity', event.transform.k > 1.1 ? 0.9 : 0);
      });
    zoomRef.current = zoom;
    svg.call(zoom);

    // ── Tick ──────────────────────────────────────────────────────────────────
    sim.on('tick', () => {
      edgeSel
        .attr('x1', d => nodeX(d.source))
        .attr('y1', d => nodeY(d.source))
        .attr('x2', d => nodeX(d.target))
        .attr('y2', d => nodeY(d.target));

      edgeLabelSel.attr('transform', d => {
        const mx = (nodeX(d.source) + nodeX(d.target)) / 2;
        const my = (nodeY(d.source) + nodeY(d.target)) / 2;
        return `translate(${mx},${my})`;
      });

      nodeSel.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });
  }, [graph, onNodeClick, buildDegreeMap, getRadius]);

  // Reinit when graph changes
  useEffect(() => { initSim(); }, [initSim]);

  // Design 4 — Focus mode: dim non-neighbors when a node is selected
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    if (!selectedNodeId) {
      svg.selectAll<SVGGElement, D3Node>('g.node').attr('opacity', 1);
      svg.selectAll<SVGLineElement, D3Edge>('line').attr('stroke-opacity', 0.6);
      return;
    }

    const neighbors = new Set([selectedNodeId]);
    edgesRef.current.forEach(e => {
      const s = nodeId(e.source);
      const t = nodeId(e.target);
      if (s === selectedNodeId) neighbors.add(t);
      if (t === selectedNodeId) neighbors.add(s);
    });

    svg.selectAll<SVGGElement, D3Node>('g.node')
      .attr('opacity', d => neighbors.has(d.id) ? 1 : 0.12);

    svg.selectAll<SVGLineElement, D3Edge>('line')
      .attr('stroke-opacity', d => {
        const s = nodeId(d.source);
        const t = nodeId(d.target);
        return neighbors.has(s) && neighbors.has(t) ? 0.7 : 0.04;
      });
  }, [selectedNodeId]);

  // Highlight ring for search results
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGCircleElement, D3Node>('circle.highlight-ring')
      .attr('opacity', d => highlightedNodeIds.includes(d.id) ? 1 : 0);
  }, [highlightedNodeIds]);

  // Drop shadow on selected node
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGCircleElement, D3Node>('circle.main-circle')
      .attr('filter', d => d.id === selectedNodeId ? 'url(#drop-shadow)' : null);
  }, [selectedNodeId]);

  // Bug 1 — Center on node: reads live position from DOM, not stale React state
  // Design 6 — Accounts for NodePanel width when computing effective center
  useEffect(() => {
    if (!centerOnNodeId || !svgRef.current || !zoomRef.current) return;

    const svgEl = svgRef.current;

    const nodeEl = svgEl.querySelector<SVGGElement>(`[data-node-id="${centerOnNodeId}"]`);
    if (!nodeEl) return;

    const transform = nodeEl.getAttribute('transform');
    const match = transform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (!match) return;

    const nx = parseFloat(match[1]);
    const ny = parseFloat(match[2]);

    const svgW = svgEl.clientWidth;
    const svgH = svgEl.clientHeight;
    const targetScale = 1.2;

    const panelWidth = selectedNodeId ? 320 : 0;
    const effectiveW = svgW - panelWidth;

    const tx = effectiveW / 2 - nx * targetScale;
    const ty = svgH / 2 - ny * targetScale;

    const newTransform = d3.zoomIdentity.translate(tx, ty).scale(targetScale);

    d3.select(svgEl)
      .transition()
      .duration(600)
      .ease(d3.easeCubicInOut)
      .call(zoomRef.current.transform, newTransform);
  }, [centerOnNodeId, selectedNodeId]);

  // ── Background deselect — handled entirely in React, independent of D3 ──────
  // onMouseDown: record start position and reset moved flag.
  // onMouseMove: mark as moved if the pointer travels more than 5px (pan gesture).
  // onMouseUp:   if not moved and the target isn't inside a .node group, deselect.
  // React's synthetic events run before D3's window-level listeners, so
  // event.target correctly reflects the element under the cursor for all nodes.
  const handleSvgMouseDown = (e: React.MouseEvent) => {
    bgGestureRef.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    const { x, y } = bgGestureRef.current;
    const dist = Math.sqrt((e.clientX - x) ** 2 + (e.clientY - y) ** 2);
    if (dist > 5) bgGestureRef.current.moved = true;
  };

  const handleSvgMouseUp = (e: React.MouseEvent) => {
    if (bgGestureRef.current.moved) return;           // was a pan, not a click
    if ((e.target as Element).closest?.('.node')) return; // clicked a node
    onBackgroundClick();
  };

  return (
    <svg
      ref={svgRef}
      className="w-full"
      style={{ height: 'calc(100vh - 56px)', background: '#0f0f13' }}
      onMouseDown={handleSvgMouseDown}
      onMouseMove={handleSvgMouseMove}
      onMouseUp={handleSvgMouseUp}
    />
  );
}
