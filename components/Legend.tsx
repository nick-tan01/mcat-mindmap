'use client';

import { DOMAIN_COLORS } from '@/lib/colors';
import { MCATDomain } from '@/lib/types';

export default function Legend() {
  const domains = Object.keys(DOMAIN_COLORS) as MCATDomain[];

  return (
    <div
      className="absolute bottom-4 left-4 rounded-lg p-3 text-xs"
      style={{ background: '#1a1a24', border: '1px solid #2a2a38', zIndex: 10 }}
    >
      <div className="font-semibold mb-2" style={{ color: '#8888a8' }}>Domains</div>
      <div className="flex flex-col gap-1">
        {domains.map(domain => (
          <div key={domain} className="flex items-center gap-2">
            <span
              className="inline-block rounded-full"
              style={{ width: 10, height: 10, background: DOMAIN_COLORS[domain], flexShrink: 0 }}
            />
            <span style={{ color: '#e8e8f0' }}>{domain}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
