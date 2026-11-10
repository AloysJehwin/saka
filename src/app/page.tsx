export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-emerald-600">saka · PriceTwin</p>
      <h1 className="text-4xl font-semibold leading-tight">Test a new price on real PayPal checkouts before you risk your customers.</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        saka learns how your customers react to price from your PayPal sales, shows an honest forecast range,
        then lets PayPal test the new price on a slice of real checkouts and narrows the range with every purchase.
      </p>
      <p className="text-sm text-zinc-500">In development for the PayPal AI Hackathon.</p>
    </main>
  );
}
