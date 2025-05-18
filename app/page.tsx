'use client'

import { signOut } from "@/lib/auth"

import AccordionComponent from '@/components/origin-accordion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ModeToggle } from "@/components/mode-toggle";

export default function Home() {
  return (
    <main className='grid place-items-center lg:max-w-3xl md:max-w-2xl sm:max-w-lg max-w-sm md:grid-cols-2 gap-8 grid-cols-1 mx-auto min-h-screen'>
      <header className='flex flex-col items-center md:max-w-lg max-w-sm mx-auto justify-center'>
        <h1 className='shadow-heading tracking-tight leading-tight text-5xl text-center flex-1'>
          Realtime Chat with <Link href={'https://zero.rocicorp.dev/'}>Zero</Link>
        </h1>
        <section className="mt-4 flex-center-2">
          <Link href='/events'>
            <Button>View</Button>
          </Link>
          <Button onClick={() => signOut()} variant={'outline'}>Logout</Button>
          <ModeToggle />
        </section>
      </header>
      <div className='flex items-center justify-center'>
        <AccordionComponent />
      </div>
    </main>
  )
}
