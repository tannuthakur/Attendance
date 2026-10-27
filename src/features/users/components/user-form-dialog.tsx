'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { useForm, type FieldPath, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { ActionResult } from '@/lib/action-result';
import { ACCESS_ROLE_LABELS } from '@/lib/format';
import { createUserSchema, updateUserSchema, type CreateUserInput, type UpdateUserInput } from '../schemas';
import { createUser, updateUser } from '../actions';

/** Applies server-side field errors to the form; returns the message to show otherwise. */
function applyResult<T extends FieldValues>(form: UseFormReturn<T>, res: ActionResult<unknown>): string | undefined {
  if (res.ok) return undefined;
  for (const [key, messages] of Object.entries(res.error.fieldErrors ?? {})) {
    if (key !== '_form') form.setError(key as FieldPath<T>, { message: messages[0] });
  }
  return res.error.message;
}

function AccessRoleField<T extends FieldValues>({
  form,
  disabled,
  description,
}: {
  form: UseFormReturn<T>;
  disabled?: boolean;
  description?: ReactNode;
}) {
  return (
    <FormField
      control={form.control}
      name={'access_role' as FieldPath<T>}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Access role</FormLabel>
          <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="viewer">{ACCESS_ROLE_LABELS.viewer} – read only</SelectItem>
              <SelectItem value="admin">{ACCESS_ROLE_LABELS.admin} – full access</SelectItem>
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { full_name: '', email: '', access_role: 'viewer', mode: 'invite', password: '' },
  });
  const mode = form.watch('mode');

  const onSubmit = (values: CreateUserInput) =>
    startTransition(async () => {
      setError(undefined);
      const res = await createUser(values.mode === 'invite' ? { ...values, password: undefined } : values);
      if (res.ok) {
        toast.success(values.mode === 'invite' ? `Invitation sent to ${values.email}` : 'User created');
        setOpen(false);
        form.reset();
      } else {
        setError(applyResult(form, res));
      }
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          form.reset();
          setError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <UserPlus aria-hidden /> Add user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>Admins have full access; viewers can only read.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <AccessRoleField form={form} />
            <FormField
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sign-in setup</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="invite" id="mode-invite" />
                        <Label htmlFor="mode-invite" className="font-normal">
                          Send invite email
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="password" id="mode-password" />
                        <Label htmlFor="mode-password" className="font-normal">
                          Set temporary password
                        </Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {mode === 'password' ? (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temporary password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>Share it securely; the user can change it after signing in.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <p className="text-sm text-muted-foreground">The user receives an email link to choose a password.</p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : mode === 'invite' ? 'Send invite' : 'Create user'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type EditProps = {
  user: { id: string; full_name: string; email: string; access_role: 'admin' | 'viewer'; is_active: boolean };
  isSelf: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditUserDialog({ user, isSelf, open, onOpenChange }: EditProps) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    values: { id: user.id, full_name: user.full_name, access_role: user.access_role, is_active: user.is_active },
  });

  const onSubmit = (values: UpdateUserInput) =>
    startTransition(async () => {
      setError(undefined);
      const res = await updateUser(values);
      if (res.ok) {
        toast.success('User updated');
        onOpenChange(false);
      } else {
        setError(applyResult(form, res));
      }
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setError(undefined);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <AccessRoleField
              form={form}
              disabled={isSelf}
              description={isSelf ? 'You cannot change your own access role.' : undefined}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-2">
                  <div>
                    <FormLabel>Active</FormLabel>
                    <FormDescription>
                      {isSelf ? 'You cannot deactivate yourself.' : 'Inactive users cannot sign in.'}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSelf} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
