import { requireUser } from "@/shared/supabase/auth";
import Card from "@/shared/ui/Card";
import Field from "@/shared/ui/Field";
import NumberInput from "@/shared/ui/NumberInput";
import ThemeToggle from "@/features/settings/ui/ThemeToggle";
import { saveSettings } from "@/features/settings/data/actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>

      {searchParams.saved && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 mb-4">
          Settings saved.
        </div>
      )}

      <form action={saveSettings}>
        <Card title="Personal settings">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Monthly savings contribution ($)" hint="What you contribute to investments each month, in USD.">
              <NumberInput
                name="monthly_savings_contribution"
                defaultValue={profile?.monthly_savings_contribution ?? 0}
                min={0}
                step={100}
              />
            </Field>
            <Field label="Expected future payments goal ($M)" hint="Total target, in millions of USD.">
              <NumberInput
                name="net_worth_goal"
                defaultValue={profile?.net_worth_goal ?? 0}
                min={0}
                step={0.01}
              />
            </Field>
            <Field label="Monthly cash flow goal ($k)" hint="Target monthly cash flow from Amplicons, in thousands of USD.">
              <NumberInput
                name="monthly_cashflow_goal"
                defaultValue={profile?.monthly_cashflow_goal ?? 0}
                min={0}
                step={0.1}
              />
            </Field>
          </div>
        </Card>

        <button type="submit" className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-4 py-2 rounded">
          Save settings
        </button>
      </form>

      <div className="mt-4">
        <Card title="Appearance">
          <ThemeToggle />
        </Card>
      </div>
    </div>
  );
}
