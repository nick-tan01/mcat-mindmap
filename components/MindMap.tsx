'use client';

import { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { GraphData, GraphNode, GraphEdge } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/colors';
import { truncateLabel } from '@/lib/graphUtils';

interface MindMapProps {
  graph: GraphData;
  selectedNodeId: string | null;
  highlightedNodeIds: string[];
  onNodeClick: (nodeId: string) => void;
  centerOnNodeId: string | null;
}

type D3Node = GraphNode & d3.SimulationNodeDatum;
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

export default function MindMap({
  graph,
  selectedNodeId,
  highlightedNodeIds,
  onNodeClick,
  centerOnNodeId,
}: MindMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3.Simulation<D3Node, D3Edge> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodesRef = useRef<D3Node[]>([]);
  const edgesRef = useRef<D3Edge[]>([]);

  const initSim = useCallback(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const { width, height } = svgRef.current.getBoundingClientRect();

    svg.selectAll('*').remove();

    // Defs for arrowheads
    const defs = svg.append('defs');
    Object.entries(EDGE_COLORS).forEach(([type, color]) => {
      defs
        .append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 32)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
    });

    // Container g for zoom
    const g = svg.append('g').attr('class', 'zoom-container');

    // Highlight pulse filter
    const filter = defs.append('filter').attr('id', 'glow-yellow');
    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Drop shadow for selected
    const shadow = defs.append('filter').attr('id', 'drop-shadow');
    shadow.append('feDropShadow')
      .attr('dx', '0').attr('dy', '0')
      .attr('stdDeviation', '6')
      .attr('flood-color', '#6366f1')
      .attr('flood-opacity', '0.8');

    const edgeGroup = g.append('g').attr('class', 'edges');
    const nodeGroup = g.append('g').attr('class', 'nodes');

    // Clone nodes preserving positions
    const newNodes: D3Node[] = graph.nodes.map(n => {
      const existing = nodesRef.current.find(e => e.id === n.id);
      return existing ? { ...n, x: existing.x, y: existing.y } : { ...n };
    });
    nodesRef.current = newNodes;

    const newEdges: D3Edge[] = graph.edges.map(e => ({ ...e }));
    edgesRef.current = newEdges;

    // Simulation
    const sim = d3
      .forceSimulation<D3Node>(newNodes)
      .force(
        'link',
        d3
          .forceLink<D3Node, D3Edge>(newEdges)
          .id((d) => d.id)
          .distance(120)
          .strength(0.8)
      )
      .force('charge', d3.forceManyBody<D3Node>().strength(-300).theta(0.9))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<D3Node>(40))
      .alphaDecay(0.028);

    simRef.current = sim;

    // Draw edges
    const edgeSel = edgeGroup
      .selectAll<SVGLineElement, D3Edge>('line')
      .data(newEdges, (d) => d.id)
      .join('line')
      .attr('stroke', d => EDGE_COLORS[d.type] || '#8888a8')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', d => `url(#arrow-${d.type})`);

    // Edge labels
    const edgeLabelSel = edgeGroup
      .selectAll<SVGTextElement, D3Edge>('text')
      .data(newEdges, (d) => d.id + '-label')
      .join('text')
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', '#8888a8')
      .attr('opacity', 0)
      .text(d => d.label);

    // Draw nodes
    const nodeSel = nodeGroup
      .selectAll<SVGGElement, D3Node>('g.node')
      .data(newNodes, (d) => d.id)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer');

    // Mastery ring
    nodeSel.each(function(d) {
      const g = d3.select(this);
      g.select('circle.ring').remove();
      if (d.mastery !== 'unreviewed') {
        const ringColor =
          d.mastery === 'learning' ? '#ef4444' :
          d.mastery === 'reviewing' ? '#f59e0b' : '#10b981';
        const dash = d.mastery === 'mastered' ? undefined : '4 2';
        const ring = g.append('circle')
          .attr('class', 'ring')
          .attr('r', 26)
          .attr('fill', 'none')
          .attr('stroke', ringColor)
          .attr('stroke-width', 2);
        if (dash) ring.attr('stroke-dasharray', dash);
      }
    });

    // Main circle
    nodeSel.append('circle')
      .attr('class', 'main-circle')
      .attr('r', d => d.id === selectedNodeId ? 28 : 22)
      .attr('fill', d => DOMAIN_COLORS[d.domain] || '#94a3b8')
      .attr('stroke', '#0f0f13')
      .attr('stroke-width', 2);

    // Highlight ring for search
    nodeSel.append('circle')
      .attr('class', 'highlight-ring')
      .attr('r', 28)
      .attr('fill', 'none')
      .attr('stroke', '#fbbf24')
      .attr('stroke-width', 3)
      .attr('opacity', 0);

    // Label
    nodeSel.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 36)
      .attr('font-size', 11)
      .attr('fill', '#e8e8f0')
      .text(d => truncateLabel(d.label));

    // Drag
    const drag = d3.drag<SVGGElement, D3Node>()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeSel.call(drag as d3.DragBehavior<SVGGElement, D3Node, D3Node | d3.SubjectPosition>);

    // Click (only if drag distance < 5px)
    nodeSel.on('click', (event, d) => {
      event.stopPropagation();
      onNodeClick(d.id);
    });

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', event => {
        g.attr('transform', event.transform);
        // Show/hide edge labels based on zoom scale
        edgeLabelSel.attr('opacity', event.transform.k > 1.2 ? 0.7 : 0);
      });
    zoomRef.current = zoom;
    svg.call(zoom);

    // Tick
    sim.on('tick', () => {
      edgeSel
        .attr('x1', d => (d.source as D3Node).x ?? 0)
        .attr('y1', d => (d.source as D3Node).y ?? 0)
        .attr('x2', d => (d.target as D3Node).x ?? 0)
        .attr('y2', d => (d.target as D3Node).y ?? 0);

      edgeLabelSel
        .attr('x', d => (((d.source as D3Node).x ?? 0) + ((d.target as D3Node).x ?? 0)) / 2)
        .attr('y', d => (((d.source as D3Node).y ?? 0) + ((d.target as D3Node).y ?? 0)) / 2);

      nodeSel.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });
  }, [graph, selectedNodeId, onNodeClick]);

  // Reinit when graph changes
  useEffect(() => {
    initSim();
  }, [initSim]);

  // Apply highlighted node styling
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGCircleElement, D3Node>('g.node circle.highlight-ring')
      .attr('opacity', (d: D3Node) => highlightedNodeIds.includes(d.id) ? 1 : 0);
  }, [highlightedNodeIds]);

  // Apply selected node styling
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGCircleElement, D3Node>('g.node circle.main-circle')
      .attr('r', (d: D3Node) => d.id === selectedNodeId ? 28 : 22)
      .attr('filter', (d: D3Node) => d.id === selectedNodeId ? 'url(#drop-shadow)' : null);
  }, [selectedNodeId]);

  // Center on node
  useEffect(() => {
    if (!centerOnNodeId || !svgRef.current || !zoomRef.current) return;
    const node = nodesRef.current.find(n => n.id === centerOnNodeId);
    if (!node || node.x === undefined || node.y === undefined) return;
    const { width, height } = svgRef.current.getBoundingClientRect();
    const svg = d3.select(svgRef.current);
    svg.transition().duration(600).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(width / 2 - (node.x ?? 0), height / 2 - (node.y ?? 0)).scale(1.5)
    );
  }, [centerOnNodeId]);

  return (
    <svg
      ref={svgRef}
      className="w-full"
      style={{ height: 'calc(100vh - 56px)', background: '#0f0f13' }}
    />
  );
}
