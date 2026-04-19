import { Navigation } from './components/Navigation'
import { Hero } from './components/Hero'
import { LiveCounter } from './components/LiveCounter'
import { HowItWorks } from './components/HowItWorks'
import { WhatYouGet } from './components/WhatYouGet'
import { Pricing } from './components/Pricing'
import { Transparency } from './components/Transparency'
import { FAQ } from './components/FAQ'
import { Footer } from './components/Footer'

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        <Hero />
        <LiveCounter />
        <HowItWorks />
        <WhatYouGet />
        <Pricing />
        <Transparency />
        <FAQ />
      </main>
      <Footer />
    </div>
  )
}
