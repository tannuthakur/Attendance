import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getDefaultWeekendDays, getSettings, getToday } from '@/features/lookups/queries';
import { getRates } from '../queries';
import { PayrollSettingsForm, RateDialog, RatesTable } from './rates';

/** Settings ▸ Night allowance: payroll currency, default weekend days, default rate + history (§17.4). */
export async function NightAllowanceSettingsCard() {
  const [settings, weekendDays, rates, today] = await Promise.all([
    getSettings(),
    getDefaultWeekendDays(),
    getRates(null),
    getToday(),
  ]);
  const currency = settings.payroll_currency ?? 'INR';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Night allowance</CardTitle>
        <CardDescription>
          Employee payout for night shifts worked in the office on working days. Never added to client invoices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <PayrollSettingsForm currency={currency} weekendDays={weekendDays} />
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Default rate</h3>
            <RateDialog
              currency={currency}
              today={today}
              trigger={
                <Button size="sm" variant="outline">
                  <Plus aria-hidden /> New default rate
                </Button>
              }
            />
          </div>
          <RatesTable rows={rates} currency={currency} emptyText="No default rate yet — night shifts earn nothing until one is set." />
        </div>
      </CardContent>
    </Card>
  );
}
