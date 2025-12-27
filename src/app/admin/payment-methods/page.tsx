'use client';

import AdminLayout from '@/components/admin/AdminLayout';
import AdminPaymentMethodsPanel from '@/components/admin/AdminPaymentMethodsPanel';

export default function AdminPaymentMethodsPage() {
  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-10">
        <AdminPaymentMethodsPanel displayMode="page" />
      </div>
    </AdminLayout>
  );
}
