import { GraphData } from './types';

const STORAGE_KEY = 'mcat_mindmap_v1';

export function saveGraph(graph: GraphData): void {
  // Strip D3 simulation positions before saving — they are re-computed on load
  const clean = {
    ...graph,
    nodes: graph.nodes.map(({ x, y, fx, fy, ...rest }) => rest),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw e;
  }
}

export function loadGraph(): GraphData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GraphData;
  } catch {
    return null;
  }
}

export function exportGraphJSON(graph: GraphData): void {
  const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mcat-mindmap-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importGraphJSON(file: File): Promise<GraphData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        resolve(JSON.parse(e.target?.result as string) as GraphData);
      } catch {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.readAsText(file);
  });
}
