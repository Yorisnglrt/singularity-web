'use client';

import { I18nProvider } from '@/i18n';
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <I18nProvider>
        <Navbar />
        <main>{children}</main>
        <Footer />
      </I18nProvider>
    </AuthProvider>
  );
}
