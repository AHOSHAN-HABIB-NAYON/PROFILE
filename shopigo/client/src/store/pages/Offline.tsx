import { WifiOff } from 'lucide-react';
import { useT } from '../../lib/i18n';
import { Button, Empty } from '../../components/ui';

export default function Offline() {
  const t = useT();
  return <Empty icon={<WifiOff className="size-9" />} title={t('offline')} action={<Button onClick={() => location.reload()}>{t('tryAgain')}</Button>} />;
}
