'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { reconnectSocket } from '@/lib/realtime';
import { MORE, ThemeToggle } from '@/components/layout/app-shell';
import { Avatar, Card } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icons';

export default function MorePage() {
  const me = useMe().data;
  const router = useRouter();
  const qc = useQueryClient();
  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {me && (
        <Link href="/profile">
          <Card className="flex items-center gap-4">
            <Avatar name={me.name} url={me.avatarUrl} size={56} />
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{me.name}</p>
              <p className="text-sm text-muted truncate">{me.email}</p>
              <p className="text-[12px] text-muted num">UID {me.uid}</p>
            </div>
            <Icon name="chevronRight" className="text-faint" />
          </Card>
        </Link>
      )}
      <Card padded={false}>
        {MORE.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="flex items-center gap-3 px-4 h-14 border-b border-line last:border-0 active:bg-card-2"
          >
            <Icon name={m.icon} size={20} className="text-accent" />
            <span className="flex-1 font-medium text-[15px]">{m.label}</span>
            <Icon name="chevronRight" size={18} className="text-faint" />
          </Link>
        ))}
      </Card>
      <Card className="flex items-center justify-between">
        <span className="font-medium">Theme</span>
        <ThemeToggle />
      </Card>
      <button
        onClick={async () => {
          await post('/auth/logout');
          qc.clear();
          reconnectSocket();
          router.replace('/login');
        }}
        className="w-full h-12 rounded-2xl bg-down-soft text-down font-semibold"
      >
        Sign out
      </button>
    </div>
  );
}
