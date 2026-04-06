'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { LayoutGrid, Users, Phone, User } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/directory', label: 'Home', icon: LayoutGrid },
  { href: '/friends', label: 'Friends', icon: Users },
  { href: '/history', label: 'History', icon: Phone },
  { href: '/profile', label: 'Profile', icon: User },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-bottom">
      <div className="glass-dark rounded-t-2xl px-2 py-2 flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center justify-center w-full h-full"
            >
              <div className={`p-1.5 rounded-xl transition-all ${
                isActive 
                  ? 'text-[var(--cyan)] bg-[var(--cyan-dim)]' 
                  : 'text-[var(--text-secondary)]'
              }`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={`text-[9px] font-medium mt-0.5 ${
                isActive ? 'text-[var(--cyan)]' : 'text-[var(--text-tertiary)]'
              }`}>
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="mobile-nav-dot"
                  className="absolute -top-1 w-1 h-1 rounded-full bg-[var(--cyan)]"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}