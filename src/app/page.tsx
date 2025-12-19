'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import PackagesSection from './components/PackagesSection';

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        setUser(session.user);
      }
      
      setLoading(false);
    };

    getSession();
  }, [supabase.auth]);

  // Redirect to dashboard if user is logged in
  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100">
      <main className="container mx-auto flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
        <div className="w-full max-w-4xl space-y-8">
          <div className="space-y-6">
            <h1 className="text-5xl font-bold text-gray-900 sm:text-6xl">
              First Steps Referral Network
            </h1>
            <p className="text-xl text-gray-600">
              Earn commissions by referring others to our exclusive packages.
              <br />
              Start building your network and income today!
            </p>
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={() => router.push('/signup')}
              className="w-full rounded-md bg-indigo-600 px-8 py-4 text-lg font-medium text-white shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
            >
              Join Now - It's Free
            </button>
            <button
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full rounded-md bg-white px-8 py-4 text-lg font-medium text-indigo-600 shadow-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
            >
              How It Works
            </button>
          </div>
        </div>

        <div id="how-it-works" className="mt-24 w-full max-w-6xl">
          <h2 className="text-3xl font-bold text-gray-900 mb-12">Start Earning in 3 Simple Steps</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                title: '1. Sign Up',
                description: 'Create your free account and get your unique referral link',
                icon: '📝'
              },
              {
                title: '2. Share & Refer',
                description: 'Share your link and earn when people sign up through it',
                icon: '📢'
              },
              {
                title: '3. Earn Commissions',
                description: 'Get paid for every package your referrals purchase',
                icon: '💰'
              },
            ].map((step, index) => (
              <div key={index} className="rounded-xl bg-white p-8 shadow-lg hover:shadow-xl transition-shadow">
                <div className="text-4xl mb-4">{step.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        <PackagesSection />
      </main>
    </div>
  );
}
