import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Service Call Analyzer | AI-Powered Call Analysis',
  description: 'Analyze service call recordings for compliance, sales insights, and performance optimization',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
