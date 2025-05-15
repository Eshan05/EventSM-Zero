'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, MailCheckIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { IoInformationOutline } from 'react-icons/io5';
import { toast } from 'sonner';
import { signIn } from 'next-auth/react';

import LinesLoader from '@/components/linesLoader';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/mobile-tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SignInInput, SignUpInput, signInSchema, signUpSchema } from '@/lib/zod.auth';
import Image from 'next/image';
import { calculatePasswordStrength } from '@/utils/password-strength';

function AuthMessagesHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');
  const signupSuccess = searchParams.get('signup');
  const verifyEmailNeeded = searchParams.get('verifyEmail');
  const emailForVerification = searchParams.get('email');
  const confirmationMessage = searchParams.get('message');

  useEffect(() => {
    let handled = false;
    const newParams = new URLSearchParams(searchParams.toString());

    if (errorParam) {
      console.error("Auth.js Error Param:", errorParam);
      switch (errorParam) {
        case 'CredentialsSignin':
          toast.error('Sign In Failed', { description: "Invalid email/username or password." });
          break;
        case 'OAuthSignin':
        case 'OAuthCallback':
        case 'OAuthCreateAccount':
        case 'EmailSignin':
        case 'EmailCreateAccount':
        case 'CallbackRouteError':
          toast.error('Authentication Error', { description: 'An error occurred during authentication. Please try again.' });
          break;
        case 'SessionRequired':
          toast.info('Login Required', { description: 'Please log in to access that page.' });
          break;
        case 'AccessDenied':
          toast.error('Access Denied', { description: errorParam });
          break;
        default:
          toast.error("Error", { description: errorParam });
          break;
      }
      newParams.delete('error');
      handled = true;
    } else if (confirmationMessage) {
      toast.success("Success", { description: confirmationMessage });
      newParams.delete('message');
      handled = true;
    } else if (signupSuccess === 'success' && verifyEmailNeeded === 'true') {
      toast.info('Account Created!', {
        description: `You can now sign in with your username/email and password.`,
        duration: 8000,
      });

      newParams.delete('signup');
      newParams.delete('verifyEmail');
      newParams.delete('email');
      handled = true;
    }

    if (handled) {
      router.replace(`${window.location.pathname}${newParams.size > 0 ? `?${newParams.toString()}` : ''}`, { scroll: false });
    }
  }, [searchParams]);
  return null;
}

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || searchParams.get('next') || '/';
  const initialMode = searchParams.get('mode') || 'signin';
  const [activeTab, setActiveTab] = useState<string>(initialMode);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const signInForm = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      identifier: '',
      password: '',
    },
  });

  // Sign Up Form
  const signUpForm = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: '',
      username: '',
      password: '',
    },
    mode: "onChange",
  });

  const password = signUpForm.watch('password');
  const strength = calculatePasswordStrength(password);

  const strengthColors = [
    'bg-gray-300',
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-green-500',
    'bg-emerald-600'
  ];

  useEffect(() => {
    if (activeTab) {
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.set('mode', activeTab);
      router.replace(`${window.location.pathname}?${newParams.toString()}`, { scroll: false });
    }
  }, [activeTab, router, searchParams]);


  const handleSignIn = async (data: SignInInput) => {
    setIsLoading(true);
    signInForm.clearErrors('root.apiError');
    console.log("Sign In Data:", data);
    if (data.identifier.includes('@')) {
      data.identifier = data.identifier.toLowerCase();
    }

    const result = await signIn('credentials', {
      ...data,
      redirect: false,
      // callbackUrl: callbackUrl,
    });

    setIsLoading(false);

    if (result?.error) {
      console.error("Auth.js signIn Error:", result.error);
      let errorMessage = "Sign In Failed: An unknown error occurred.";
      if (result.error === 'CredentialsSignin') {
        errorMessage = "Invalid email/username or password.";
        signInForm.setError("root.apiError", { message: errorMessage }); // Set root error
      } else if (result.error === 'Error') {
        errorMessage = "Authentication failed.";
        signInForm.setError("root.apiError", { message: errorMessage });
      }
      if (result.error) {
        const userFriendlyError = result.error === 'CredentialsSignin' ?
          'Invalid email/username or password.' :
          (result.error === 'Error' ? 'Authentication failed.' : 'An unknown error occurred.');

        signInForm.setError("root.apiError", { message: userFriendlyError });
        toast.error('Sign In Failed', { description: userFriendlyError });
      }

    } else if (result?.ok) {
      toast.success('Sign in successful!');
      router.push(callbackUrl);
    } else {
      console.error("Auth.js signIn unexpected result:", result);
      signInForm.setError("root.apiError", { message: "An unexpected response received." });
      toast.error('Sign In Failed', { description: "An unexpected response received." });
    }
  };

  const handleSignUp = async (data: SignUpInput) => {
    setIsLoading(true);
    console.log("Sign Up Data:", data);
    signUpForm.clearErrors('root.apiError');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('[SignUpPage] API Error:', response.status, result);
        let userFacingMessage = result.error || `Sign-up failed with status ${response.status}.`;

        switch (response.status) {
          case 400:
            userFacingMessage = "Invalid input data. Please correct the fields.";
            if (result.details?.fieldErrors) {
              Object.keys(result.details.fieldErrors).forEach(field => {
                signUpForm.setError(field as keyof SignUpInput, {
                  type: 'manual',
                  message: result.details.fieldErrors[field][0]
                });
              });
            }
            signUpForm.setError("root.apiError", { type: "manual", message: userFacingMessage });
            break;
          case 409: //
            signUpForm.setError("root.apiError", { type: "manual", message: userFacingMessage });
            break;
          case 429:
            userFacingMessage = "Too many signup attempts. Please try again later.";
            toast.error("Rate Limit", { description: userFacingMessage });
            signUpForm.setError("root.apiError", { type: "manual", message: userFacingMessage });
            break;
          case 500:
            userFacingMessage = "An unexpected server error occurred. Please try again.";
            toast.error("Sign Up Error", { description: userFacingMessage });
            signUpForm.setError("root.apiError", { type: "manual", message: userFacingMessage });
            break;
          default:
            toast.error("Sign Up Error", { description: userFacingMessage });
            signUpForm.setError("root.apiError", { type: "manual", message: userFacingMessage });
            break;
        }

      } else {
        signUpForm.reset();
        toast.success(result.message || 'Account created successfully!');
        router.replace('/u?mode=signin&signup=success', { scroll: false });
      }
    } catch (error) {
      console.error('[SignUpPage] Network error:', error);
      const networkErrorMessage = "Failed to connect to the server. Please check your network connection.";
      signUpForm.setError("root.apiError", { type: "manual", message: networkErrorMessage });
      toast.error("Sign Up Error", { description: networkErrorMessage });
    } finally {
      setIsLoading(false);
    }
  };


  const togglePasswordVisibility = () => setShowPassword(!showPassword);


  return (
    <Suspense fallback={<LinesLoader />}>
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-50 to-white dark:from-neutral-950 dark:to-neutral-400/10 p-4">
        <Card className="w-full max-w-md pb-0 overflow-clip">
          <CardHeader className="flex-row flex gap-4 items-center justify-between">
            <section className="grid auto-rows-min grid-rows-[auto_auto] items-start gap-1">
              <CardTitle className='text-2xl font-bold'>
                {activeTab === 'signin' ? 'Welcome Back!' : 'Create an Account'}
              </CardTitle>
              <CardDescription className='text-[.8rem]'>
                {activeTab === 'signin'
                  ? 'Log in to your account!'
                  : 'Enter your details to get started.'}
              </CardDescription>
            </section>
            {/* Image component */}
            <Image src="/logo.svg" alt="Logo" width={32} height={32} className='dark:invert-80 aspect-square' />
          </CardHeader>

          <AuthMessagesHandler /> {/* Component to handle URL params */}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-2/3 mx-auto grid-cols-2 mb-4">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            {/* Sign In Form */}
            <TabsContent value="signin">
              <Form {...signInForm}>
                <form onSubmit={signInForm.handleSubmit(handleSignIn)} className="space-y-6">
                  <CardContent className="space-y-4">
                    {/* API Error Display */}
                    {signInForm.formState.errors.root?.apiError && (
                      <div className="text-destructive text-sm p-3 bg-destructive/10 rounded-md">
                        {signInForm.formState.errors.root.apiError.message}
                      </div>
                    )}

                    {/* Identifier Field */}
                    <FormField
                      control={signInForm.control}
                      name="identifier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email or Username</FormLabel>
                          <FormControl>
                            <Input placeholder="Username or email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Password Field */}
                    <FormField
                      control={signInForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className='flex items-center justify-between'>
                            <span>Password</span>
                            {/* Forgot password link */}
                            <Link href="/u/forgot-password" prefetch={false} className='text-muted-foreground text-xs hover:underline'>Forgot?</Link>
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                {...field}
                              />
                              {/* Password visibility toggle button */}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                                onClick={togglePasswordVisibility}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Submit Button */}
                    <section className="flex flex-col gap-4">
                      <Button type="submit" disabled={isLoading} className="w-full">
                        {isLoading ? 'Signing In...' : 'Sign In'}
                      </Button>
                    </section>
                  </CardContent>
                </form>
              </Form>
            </TabsContent>

            {/* Sign Up Form */}
            <TabsContent value="signup">
              <Form {...signUpForm}>
                <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-6">
                  <CardContent className="space-y-4">
                    {/* API Error Display */}
                    {signUpForm.formState.errors.root?.apiError && (
                      <div className="text-destructive text-sm p-3 bg-destructive/10 rounded-md">
                        {signUpForm.formState.errors.root?.apiError.message}
                      </div>
                    )}

                    {/* Email Field */}
                    <FormField
                      control={signUpForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <header className='px-1 flex items-center gap-2 font-medium'>
                            {/* Email Info Tooltip */}
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size={'fit-icon'} variant='outline' type='button' className='rounded-sm'>
                                    <IoInformationOutline className='hover:text-black dark:hover:text-white text-muted-foreground' />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className=''>
                                  <div className='space-y-1 flex flex-col w-60'>
                                    <h4 className='font-semibold text-base'>Email</h4>
                                    <p className='text-[.75rem] font-normal'>
                                      You are free to use any active email. You will not be able to change this later.
                                    </p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                              <span className=''>Email</span>
                            </>
                          </header>
                          <FormControl>
                            <Input placeholder="Email" {...field} tabIndex={1} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Username Field */}
                    <FormField
                      control={signUpForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <header className='px-1 flex items-center gap-2 font-medium'>
                              {/* Username Info Tooltip */}
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size={'fit-icon'} variant='outline' type='button' className='rounded-sm'>
                                      <IoInformationOutline className='hover:text-black dark:hover:text-white text-muted-foreground' />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className='w-60'>
                                    <div className='space-y-1 flex flex-col'>
                                      <h4 className='font-semibold text-base'>Username</h4>
                                      <p className='text-[.75rem] font-normal'>
                                        The username can only comprise of alphanumeric characters, dots and underscores. You will not be able to change this later.
                                      </p>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                                <span className=''>Username</span>
                              </>
                            </header>
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="Username" {...field} tabIndex={1} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Display Name Field (Optional based on your Zod schema) */}
                    {/*
                      <FormField
                      control={signUpForm.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                           <FormLabel>Display Name (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Your Name" {...field} tabIndex={1} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     */}

                    {/* Password Field */}
                    <FormField
                      control={signUpForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className='flex items-center justify-between'>
                            <span>Password</span>
                            <span className='text-muted-foreground text-xs'>Min. 8 characters</span>
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                {...field}
                                tabIndex={1}
                              />
                              {/* Password visibility toggle button */}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                                onClick={togglePasswordVisibility}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
                              </Button>
                            </div>
                          </FormControl>
                          {/* Password strength indicator */}
                          <div className="my-1 flex w-full gap-1 h-2">
                            {[0, 1, 2, 3, 4].map((level) => ( // Render 5 bars for 0-4 strength index
                              <div
                                key={level}
                                className={`h-full flex-1 rounded-full transition-colors duration-300 ${level < strength ? strengthColors[strength] : 'bg-gray-300'}`} // Highlight bars up to current strength
                              ></div>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Terms and Privacy Checkboxes */}
                    <section className='flex flex-col space-y-2.5 mx-1'>
                      <div className="flex items-center space-x-2"> {/* Use flex-center-2 style */}
                        <Checkbox id="terms" />
                        <Label htmlFor='terms' className='text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'>
                          I agree to the <Link prefetch={false} href="#" className='underline'>Terms of Service</Link>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2"> {/* Use flex-center-2 style */}
                        <Checkbox id="privacy" />
                        <Label htmlFor='privacy' className='text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'>
                          I agree to the <Link prefetch={false} href="#" className='underline'>Privacy Policy</Link>
                        </Label>
                      </div>
                    </section>
                    {/* Submit Button */}
                    <Button type="submit" disabled={isLoading} className="w-full mt-4">
                      {isLoading ? 'Creating Account...' : 'Create Account'}
                    </Button>
                  </CardContent>
                </form>
              </Form>
            </TabsContent>

          </Tabs>

          {/* Footer with switch links */}
          <CardFooter className="flex flex-col items-center gap-1 bg-muted border-t-2 py-3">
            <p className="text-center text-sm text-muted-foreground">
              {activeTab === 'signin' ? (
                <>
                  Don't have an account?{' '}
                  <button onClick={() => setActiveTab('signup')} type="button" className="font-medium text-primary hover:underline">
                    Sign Up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button onClick={() => setActiveTab('signin')} type="button" className="font-medium text-primary hover:underline">
                    Sign In
                  </button>
                </>
              )}
            </p>
            <p className="text-center text-sm text-muted-foreground flex items-center space-x-1"> {/* Use flex-center-2 style */}
              <MailCheckIcon className="h-4 w-4" />
              <span>Need help?</span>{' '}
              <Link href="/contact" className="font-medium text-primary hover:underline">
                Contact Us
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </Suspense>
  );
}