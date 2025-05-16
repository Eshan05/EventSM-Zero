import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  AtSignIcon,
  CommandIcon,
  EclipseIcon,
  LucideIcon,
  ZapIcon,
} from 'lucide-react'
import React from 'react'

interface AccordionItem {
  id: string
  icon: LucideIcon
  title: string
  content: React.ReactNode
}

const items: AccordionItem[] = [
  {
    id: '1',
    icon: CommandIcon,
    title: 'What is this?',
    content: (
      <span>
        This is a demonstration of using Zero (Rocicorp) which is a sync engine to power a realtime chat. It has Neon for it's primary database, and <code>node-postgres</code> as well as <code>auth.js</code>. It is just a learning project for me to see how Zero (still in alpha) works in the real world. It is not a highly optimized application though.
      </span>
    ),
  },
]

export default function AccordionComponent() {
  return (
    <div className='space-y-4 w-60 md:w-[unset]'>
      <Accordion type='single' collapsible className='w-full' defaultValue='1'>
        {items.map((item) => (
          <AccordionItem value={item.id} key={item.id} className='py-2'>
            <AccordionTrigger className='py-2 text-[15px] leading-6 hover:no-underline w-sm'>
              <span className='flex items-center gap-3'>
                <item.icon
                  size={16}
                  className='shrink-0 opacity-60'
                  aria-hidden='true'
                />
                <span>{item.title}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className='text-muted-foreground ps-7 w-full pb-2'>
              {item.content}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}