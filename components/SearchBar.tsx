'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GraphNode } from '@/lib/types';

interface SearchBarProps {
  nodes: GraphNode[];
  onHighlight: (nodeIds: string[]) => void;
  onSelect: (nodeId: string) => void;
}

export default function SearchBar({ nodes, onHighlight, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GraphNode[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(
    (q: string) => {
      if (!q.trim()) {
        setResults([]);
        onHighlight([]);
        return;
      }
      const lower = q.toLowerCase();
      const matches = nodes.filter(
        n =>
          n.label.toLowerCase().includes(lower) ||
          n.aliases.some(a => a.toLowerCase().includes(lower))
      );
      const top5 = matches.slice(0, 5);
      setResults(top5);
      onHighlight(matches.map(n => n.id));
    },
    [nodes, onHighlight]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const handleSelect = (nodeId: string) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onHighlight([]);
    onSelect(nodeId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setQuery('');
      setResults([]);
      setOpen(false);
      onHighlight([]);
    }
  };

  return (
    <div className="relative" style={{ width: 220 }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search concepts..."
        className="w-full text-sm rounded-md px-3 py-1.5 outline-none"
        style={{
          background: '#1a1a24',
          border: '1px solid #2a2a38',
          color: '#e8e8f0',
        }}
      />
      {open && results.length > 0 && (
        <div
          className="absolute top-full left-0 mt-1 w-full rounded-md shadow-xl z-50 animate-fade-in"
          style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}
        >
          {results.map(node => (
            <button
              key={node.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors"
              style={{ color: '#e8e8f0' }}
              onMouseDown={() => handleSelect(node.id)}
            >
              {node.label}
              <span className="ml-2 text-xs" style={{ color: '#8888a8' }}>
                {node.domain}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
