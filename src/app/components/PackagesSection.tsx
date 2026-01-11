'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

const PACKAGES = [
  {
    name: 'Starter',
    price: '$99',
    commission: '20%',
    features: ['Basic Features', 'Referral Tracking', 'Email Support'],
  },
  {
    name: 'Professional',
    price: '$299',
    commission: '30%',
    featured: true,
    features: ['All Starter Features', 'Advanced Analytics', 'Priority Support', 'Custom Link'],
  },
  {
    name: 'Enterprise',
    price: '$999',
    commission: '40%',
    features: ['All Professional Features', 'Dedicated Account Manager', 'API Access', 'Training Webinars'],
  },
] as const;

export default function PackagesSection() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setIsLoggedIn(!!session);
      } catch (error) {
        console.error('Error checking auth status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [supabase]);

  const handleCta = (pkgName: string) => {
    if (isLoggedIn) {
      router.push(`/dashboard?plan=${pkgName.toLowerCase()}`);
    } else {
      router.push('/login');
    }
  };

  return (
    <div className="mt-24 w-full max-w-4xl bg-white rounded-xl p-8 shadow-lg">
      <h2 className="text-3xl font-bold text-gray-900 mb-3">Our Packages</h2>
      <p className="text-gray-600 mb-8">
        Choose the perfect package to start your journey{isLoggedIn ? '' : ' (sign in to activate).'}
      </p>

      {loading ? (
        <div className="text-center text-sm text-gray-500">Checking authentication status…</div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        {PACKAGES.map((pkg, index) => (
          <div
            key={pkg.name}
            className={`rounded-lg border-2 border-transparent p-6 transition-transform duration-200 ${
              pkg.featured
                ? 'border-indigo-500 bg-indigo-50/40 shadow-xl transform scale-105'
                : 'border-gray-200 bg-white'
            }`}
          >
            {pkg.featured && (
              <div className="bg-indigo-100 text-indigo-800 text-xs font-semibold px-3 py-1 rounded-full inline-block mb-4">
                MOST POPULAR
              </div>
            )}
            <h3 className="text-2xl font-bold text-gray-900 mb-2">{pkg.name}</h3>
            <div className="text-4xl font-bold text-indigo-600 mb-4">{pkg.price}</div>
            <div className="text-lg font-medium text-gray-700 mb-6">Earn {pkg.commission} per referral</div>
            <ul className="space-y-3 mb-8">
              {pkg.features.map((feature, i) => (
                <li key={`${pkg.name}-${i}`} className="flex items-center text-gray-600">
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleCta(pkg.name)}
              className={`w-full py-3 px-6 rounded-md font-medium transition-colors ${
                isLoggedIn
                  ? pkg.featured
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isLoggedIn ? 'Get Started' : 'Sign In to Access'}
            </button>
          </div>
        ))}
      </div>

      {!isLoggedIn && !loading ? (
        <div className="mt-8 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="font-semibold text-indigo-600 hover:underline"
          >
            Sign in now
          </button>
        </div>
      ) : null}
    </div>
  );
}
