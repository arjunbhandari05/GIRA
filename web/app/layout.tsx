import type { Metadata } from 'next'
import { DM_Mono, DM_Serif_Display } from 'next/font/google'
import { GeistSans } from 'geist/font/sans'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-dm-serif',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
})

export const metadata: Metadata = {
  title: 'GIRA Rx · Genomic Inference Rx Agent',
  description: 'GIRA — pharmacogenomic clinical decision support for personalized medication management',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-white">
      <body
        className={`${GeistSans.variable} ${dmSerif.variable} ${dmMono.variable} font-sans antialiased bg-white text-[#1D1D1F]`}
      >
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
