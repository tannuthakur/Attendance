'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useIsAdmin } from '@/components/providers/current-user';
import { deleteEmployee } from '../actions';

/** Edit / Delete on the employee detail header (admins only). */
export function EmployeeAdminActions({ employeeId, name }: { employeeId: string; name: string }) {
  const isAdmin = useIsAdmin();
  const router = useRouter();
  if (!isAdmin) return null;
  return (
    <>
      <Button variant="outline" asChild>
        <Link href={`/employees/${employeeId}/edit`}>
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
        description="This permanently removes the employee, their employment history, assignments and attendance. Employees who have been invoiced cannot be deleted — mark them off-role instead."
        confirmLabel="Delete employee"
        onConfirm={async () => {
          const res = await deleteEmployee({ id: employeeId });
          if (!res.ok) {
            toast.error(res.error.message);
            return;
          }
          toast.success(`${name} deleted`);
          router.push('/employees');
        }}
      />
    </>
  );
}
