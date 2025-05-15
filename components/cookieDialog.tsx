'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { AlertDialogTrigger } from '@radix-ui/react-alert-dialog'
import { getCookies, setCookie } from 'cookies-next'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export function CookieCheckDialog({ trigger }: { trigger: React.ReactNode }) {
  const [cookiesEnabled, setCookiesEnabled] = useState(true)
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const testCookieName = 'testCookie'

    // Try to set a test cookie
    try {
      setCookie(testCookieName, 'testValue')
      const cookieValue = getCookies()
      if (cookieValue && !cookieValue[testCookieName as keyof typeof cookieValue]) {
        setCookiesEnabled(false)
        setOpen(true)
      }
    } catch (error) {
      console.log('Cookies not enabled', error)
      setCookiesEnabled(false)
      setOpen(true)
    }
  }, [])

  const handleProceed = () => {
    setOpen(false)
    router.push('/u/validate')
  }

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger>{trigger}</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cookies Required</AlertDialogTitle>
            <AlertDialogDescription>
              This website uses cookies to ensure you get the best experience. Without cookies, the
              application will not function correctly and{' '}
              <strong>You won&apos;t be able to sign up</strong>. Please enable cookies in your
              browser settings to proceed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction asChild>
              <Button disabled={!cookiesEnabled} onClick={handleProceed}>
                Proceed
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}