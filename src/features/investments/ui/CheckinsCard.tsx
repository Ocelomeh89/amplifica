import Card from "@/shared/ui/Card";
import { fmtCurrency, fmtMonth } from "@/shared/format";
import { strandCheckin } from "@/features/investments/data/actions";
import StrandButton from "./StrandButton";

export interface CheckinRowData {
  id: string;
  month: string;
  optionName: string;
  value: number;
  stranded: boolean;
}

// Value check-ins, newest first. Deleting one strands its value in Default growth.
export default function CheckinsCard({ checkins }: { checkins: CheckinRowData[] }) {
  if (checkins.length === 0) return null;
  return (
    <Card title="Value updates">
      <table className="w-full text-sm">
        <tbody>
          {checkins.map((c) => (
            <tr key={c.id} className={`border-t border-edge ${c.stranded ? "text-sub" : ""}`}>
              <td className="py-2">{fmtMonth(c.month)}</td>
              <td>{c.optionName}</td>
              <td>{fmtCurrency(c.value)}</td>
              <td className="text-xs">{c.stranded ? "Deleted: this value moved to Default growth" : ""}</td>
              <td className="text-right">
                {!c.stranded && (
                  <StrandButton id={c.id} action={strandCheckin} sourceName={c.optionName} label="Delete value update" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
