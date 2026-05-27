import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Card from "@/components/Card";
import Field from "@/components/Field";
import NumberInput from "@/components/NumberInput";
import { saveSettings } from "./actions";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>

      <form action={saveSettings}>
        <Card title="Personal settings">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly savings contribution ($)" hint="What you contribute to investments each month, in USD.">
              <NumberInput
                name="monthly_savings_contribution"
                defaultValue={profile?.monthly_savings_contribution ?? 0}
                min={0}
                step={100}
              />
            </Field>
            <Field label="External net worth ($M)" hint="Assets held outside amplifica, in millions of USD.">
              <NumberInput
                name="external_net_worth"
                defaultValue={profile?.external_net_worth ?? 0}
                min={0}
                step={0.01}
              />
            </Field>
            <Field label="Net worth goal ($M)" hint="Total target, in millions of USD.">
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

        <button type="submit" className="bg-ink text-white text-sm px-4 py-2 rounded">
          Save settings
        </button>
      </form>
    </div>
  );
}
