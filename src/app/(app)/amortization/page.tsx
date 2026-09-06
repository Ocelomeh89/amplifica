import AmortizationClient from "./AmortizationClient";

// Behind the login screen: the (app) route group's layout redirects to /login
// when there is no session.
export default function AmortizationPage() {
  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Amortization Calculator</h1>
      <AmortizationClient />
    </div>
  );
}
