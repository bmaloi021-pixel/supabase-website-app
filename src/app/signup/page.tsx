'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function SignUp() {
  const [formData, setFormData] = useState({
    username: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizeUsername = (value: string) => value.trim().toLowerCase();
  const searchParams = useSearchParams();
  const referralCode = (searchParams?.get('ref') || '').trim();
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  const router = useRouter();
  const supabase = createClient();

  // Define types for better type safety
  type AuthError = {
    message: string;
    status?: number;
    name?: string;
  };

  type SignUpError = Error & {
    status?: number;
    code?: string;
    details?: string;
    hint?: string;
  };
  
  // Function to check if username is available
  const checkUsernameAvailability = async (username: string): Promise<boolean> => {
    const normalized = normalizeUsername(username);
    const { data, error } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', normalized)
      .single();
    
    // If there's an error or no data, username is available
    return !data && !error;
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalizedUsername = normalizeUsername(formData.username);
    
    // Form validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    // Username validation
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    if (!usernameRegex.test(normalizedUsername)) {
      setError('Username must be 3-20 characters long and can only contain letters, numbers, underscores, and hyphens');
      return;
    }
    
    // Generate a system email for Supabase auth
    const systemEmail = `${normalizedUsername}@users.firststeps.app`;

    setLoading(true);

    try {
      console.log('Signup attempt with username:', normalizedUsername);

      // Sign up with system email and password
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: systemEmail,
        password: formData.password,
        options: {
          data: {
            username: normalizedUsername,
            first_name: formData.firstName,
            last_name: formData.lastName,
            user_metadata: {
              username: normalizedUsername,
              display_name: `${formData.firstName} ${formData.lastName}`.trim() || normalizedUsername,
              system_email: systemEmail
            }
          },
          emailRedirectTo: `${window.location.origin}/dashboard`
        }
      });

      if (signUpError) throw signUpError;

      if (!signUpData.user) {
        throw new Error('No user data returned from authentication');
      }
      
      // Store user data in profiles table
      const profileData = {
        id: signUpData.user.id,
        username: normalizedUsername,
        first_name: formData.firstName,
        last_name: formData.lastName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log('Creating profile with data:', profileData);
      
      const { data: profileResponse, error: profileError } = await supabase
        .from('profiles')
        .upsert(profileData)
        .select();

      console.log('Profile creation response:', { profileResponse, profileError });

      if (profileError) {
        console.error('Profile error details:', {
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint,
          code: profileError.code
        });
        throw profileError;
      }

      // Ensure we have an authenticated session (required for referrals insert with RLS)
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: systemEmail,
          password: formData.password,
        });
        if (signInError) throw signInError;
      }

      // If coming from a referral link, record the referrer
      if (referralCode) {
        const { data: referrerId, error: referrerError } = await supabase
          .rpc('get_referrer_id_by_code', { code: referralCode });

        if (!referrerError && referrerId) {
          const { error: referralInsertError } = await supabase.from('referrals').insert({
            referrer_id: referrerId,
            referred_id: signUpData.user.id,
            status: 'active',
          });

          if (referralInsertError) {
            console.error('Referral insert error:', referralInsertError);
          }
        } else {
          console.warn('Invalid referral code:', referralCode, referrerError);
        }
      }

      // Show success message and log in directly
      alert('Account created successfully! You are now logged in.');
      router.push('/dashboard');
    } catch (error) {
      const err = error as SignUpError;
      const errorDetails = {
        name: err.name,
        message: err.message,
        status: err.status,
        code: err.code,
        stack: err.stack,
        timestamp: new Date().toISOString()
      };
      
      console.error('Signup error details:', errorDetails);
      
      // User-friendly error messages
      if (err.message?.includes('email')) {
        setError('There was an issue with the email address. Please try a different username.');
      } else if (err.status === 400) {
        setError('Invalid request. Please check your details and try again.');
      } else if (err.status === 409) {
        setError('This username is already taken. Please choose another one.');
      } else if (err.message) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again or contact support.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create a new account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              sign in to your existing account
            </Link>
          </p>
        </div>
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        <form className="mt-8 space-y-4" onSubmit={handleSignUp}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  required
                  value={formData.firstName}
                  onChange={handleChange}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="John"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  required
                  value={formData.lastName}
                  onChange={handleChange}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username (for login)
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_\-]+"
                title="Username can only contain letters, numbers, underscores and hyphens"
                value={formData.username}
                onChange={handleChange}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="johndoe123"
              />
            </div>

            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={formData.password}
                onChange={handleChange}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Create a password (min 8 characters)"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Confirm your password"
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center p-3 bg-red-50 rounded-md">
              {error}
            </div>
          )}

          <div className="text-xs text-gray-500 text-center">
            By signing up, you agree to our Terms of Service and Privacy Policy
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
