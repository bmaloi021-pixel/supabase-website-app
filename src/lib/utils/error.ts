// Standard error types for the application
export type AppError = {
  message: string;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
};

type SupabaseError = {
  message: string;
  code: string;
  details?: string;
  hint?: string;
};

// Standardized error logging
export function logError(label: string, error: unknown) {
  const err = error as AppError | SupabaseError;
  const errorObj = {
    message: err.message,
    code: 'code' in err ? err.code : undefined,
    status: 'status' in err ? err.status : undefined,
    details: 'details' in err ? err.details : undefined,
    hint: 'hint' in err ? err.hint : undefined,
    timestamp: new Date().toISOString()
  };
  
  console.error(`[${label}]`, errorObj);
  return errorObj;
}

// Standardized error handler for Supabase
export function handleSupabaseError(error: unknown): AppError {
  const err = error as SupabaseError;
  const logged = logError('SupabaseError', err);
  
  return {
    message: err.message,
    code: err.code,
    details: err.details,
    hint: err.hint
  };
}

// Standardized error handler for API responses
export function handleApiError(error: unknown): AppError {
  if (typeof error === 'string') {
    return { message: error };
  }
  
  const err = error as AppError;
  const logged = logError('ApiError', err);
  
  return {
    message: err.message || 'An unknown error occurred',
    code: err.code,
    status: err.status
  };
}

// User-friendly error messages
export function getFriendlyErrorMessage(error: AppError): string {
  if (!error) return 'An unknown error occurred';
  
  if (error.message.includes('email')) {
    return 'There was an issue with the email address';
  }
  if (error.code === '23505') {
    return 'This username is already taken';
  }
  if (error.status === 400) {
    return 'Invalid request';
  }
  
  return error.message || 'An unexpected error occurred';
}
