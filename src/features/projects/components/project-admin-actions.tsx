'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useIsAdmin } from '@/components/providers/current-user';
import { deleteProject } from '../actions';

/** Edit / Delete on the project detail header (admins only). */
export function ProjectAdminActions({ projectId, name, code }: { projectId: string; name: string; code: string }) {
  const isAdmin = useIsAdmin();
  const router = useRouter();
  if (!isAdmin) return null;
  return (
    <>
      <Button variant="outline" asChild>
        <Link href={`/projects/${projectId}/edit`}>
          <Pencil aria-hidden /> Edit
        </Link>
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="outline" className="text-destructive">
            <Trash2 aria-hidden /> Delete
          </Button>
        }
        title={`Delete ${name}?`}
        description="This permanently removes the project, its status history, team assignments and project holidays. Projects with invoices cannot be deleted — end or cancel them instead."
        confirmLabel="Delete project"
        requireText={code}
        onConfirm={async () => {
          const res = await deleteProject({ id: projectId });
          if (!res.ok) {
            toast.error(res.error.message);
            return;
          }
          toast.success(`${name} deleted`);
          router.push('/projects');
        }}
      />
    </>
  );
}
