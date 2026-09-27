import { Link } from 'react-router';
import { Button, Empty } from '../../components/ui';
import { SearchX } from 'lucide-react';

export default function AdminNotFound() {
  return <Empty icon={<SearchX className="size-9" />} title="Page not found" action={<Link to="/admin"><Button>Dashboard</Button></Link>} />;
}
