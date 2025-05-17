'use client'

import { Popover as PopoverPrimitive } from "radix-ui"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { createContext, useContext, useEffect, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import {
  Tooltip as OriginalTooltip,
  TooltipContent as OriginalTooltipContent,
  TooltipProvider as OriginalTooltipProvider,
  TooltipTrigger as OriginalTooltipTrigger,
} from './tooltip'

const TouchContext = createContext<boolean | undefined>(undefined)
const useTouch = () => useContext(TouchContext)

export const TooltipProvider = ({ children, ...props }: TooltipPrimitive.TooltipProviderProps) => {
  const [isTouch, setTouch] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  return (
    <TouchContext.Provider value={isTouch}>
      <OriginalTooltipProvider {...props}>{children}</OriginalTooltipProvider>
    </TouchContext.Provider>
  )
}

export const Tooltip = (props: TooltipPrimitive.TooltipProps & PopoverPrimitive.PopoverProps) => {
  const isTouch = useTouch()
  return isTouch ? <Popover {...props} /> : <OriginalTooltip {...props} />
}

export const TooltipTrigger = (props: TooltipPrimitive.TooltipTriggerProps & PopoverPrimitive.PopoverTriggerProps) => {
  const isTouch = useTouch()
  return isTouch ? <PopoverTrigger {...props} /> : <OriginalTooltipTrigger {...props} />
}

export const TooltipContent = (props: TooltipPrimitive.TooltipContentProps & PopoverPrimitive.PopoverContentProps) => {
  const isTouch = useTouch()
  return isTouch ? <PopoverContent {...props} /> : <OriginalTooltipContent {...props} />
}