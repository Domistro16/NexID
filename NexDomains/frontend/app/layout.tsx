import type { Metadata } from 'next';
import { Providers } from './providers';
import '@/app/globals.css';
import Navbar from '@/components/navbar';

import ThemeToggle from '@/components/ThemeToggle';

export const metadata: Metadata = {
    title: 'NexDomains - Your Web3 Identity',
    description: 'Your web3 username, across all chains. Send crypto to names, not numbers.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body>
                <Providers>
                    <Navbar />
                    {children}
                    <ThemeToggle />
                </Providers>
            </body>
        </html>
    );
}
