'use client';

import { getFriendlyErrorMessage } from '@/lib/utils/error';

type ErrorDisplayProps = {
  error?: string | Error | null;
  className?: string;
};

export function ErrorDisplay({ error, className = '' }: ErrorDisplayProps) {
  if (!error) return null;
  
  const message = typeof error === 'string' 
    ? error 
    : getFriendlyErrorMessage(error);

  return (
    <div className={`p-4 text-red-700 bg-red-100 rounded-md ${className}`}>
      {message}
    </div>
  );
}
