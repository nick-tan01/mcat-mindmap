import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MCAT MindMap',
  description: 'AI-powered MCAT concept knowledge graph and study tool',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={inter.className}
        style={{ backgroundColor: '#0f0f13', color: '#e8e8f0', margin: 0, padding: 0 }}
      >
        {children}
      </body>
    </html>
  );
}
