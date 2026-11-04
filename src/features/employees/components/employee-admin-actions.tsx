'use client';
import { startNavigationProgress } from '@/components/top-progress-bar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useCan, useIsAdmin } from '@/components/providers/current-user';
import { deleteEmployee } from '../actions';

/** Edit (admins + attendance managers) / Delete (admins only) on the employee detail header. */
export function EmployeeAdminActions({ employeeId, name }: { employeeId: string; name: string }) {
  const isAdmin = useIsAdmin();
  const { manageEmployees } = useCan();
  const router = useRouter();
  if (!manageEmployees) return null;
  return (
    <>
      <Button variant="outline" asChild>
        <Link href={`/employees/${employeeId}/edit`}>
          <Pencil aria-hidden /> Edit
        </Link>
      </Button>
      {isAdmin && (
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
            startNavigationProgress();
            router.push('/employees');
          }}
        />
      )}
    </>
  );
}
