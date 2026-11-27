import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '雀EX (Jan-EX) | 異次元特殊ルール麻雀プラットフォーム',
  description:
    '少牌マイティ、鷲巣麻雀、東天紅、マーチャオAルールなど特殊ルール特化型麻雀Webアプリ',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased selection:bg-amber-500/30 selection:text-amber-200">
        {children}
      </body>
    </html>
  );
}
