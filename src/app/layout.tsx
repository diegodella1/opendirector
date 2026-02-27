import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenDirector',
  description: 'Open-source live TV production system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-od-bg text-od-text min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
