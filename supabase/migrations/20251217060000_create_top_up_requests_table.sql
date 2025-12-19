-- Create top_up_requests table
CREATE TABLE IF NOT EXISTS public.top_up_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  merchant_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  processed_at TIMESTAMP WITH TIME ZONE,
  status_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_top_up_requests_user_id ON public.top_up_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_top_up_requests_status ON public.top_up_requests(status);
CREATE INDEX IF NOT EXISTS idx_top_up_requests_merchant_id ON public.top_up_requests(merchant_id);

-- Enable RLS
ALTER TABLE public.top_up_requests ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can view their own top-up requests
CREATE POLICY "Users can view their own top-up requests" ON public.top_up_requests
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own top-up requests
CREATE POLICY "Users can insert their own top-up requests" ON public.top_up_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Merchants can view assigned top-up requests
CREATE POLICY "Merchants can view assigned top-up requests" ON public.top_up_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'merchant'
    )
  );

-- Merchants can update status of assigned requests
CREATE POLICY "Merchants can update status of assigned requests" ON public.top_up_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'merchant'
    )
  );

-- Admins can do everything
CREATE POLICY "Admins can manage all top-up requests" ON public.top_up_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_top_up_requests_updated_at
  BEFORE UPDATE ON public.top_up_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
