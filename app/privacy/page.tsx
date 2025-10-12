export default function PrivacyPolicy() {
    return (
      <div className="container py-12 space-y-6">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="text-sm text-slate-500">Last updated: 2025-10-11</p>
  
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">What we collect</h2>
          <p>
            Name, contact info, vehicle details, address, and requested appointment time.
            We use this to provide quotes and service.
          </p>
  
          <h2 className="text-xl font-semibold">How we use it</h2>
          <p>
            To confirm appointments, send quotes, and communicate about your service.
            We may use email or SMS for confirmations.
          </p>
  
          <h2 className="text-xl font-semibold">Sharing</h2>
          <p>
            We do not sell your data. We use trusted providers (e.g., Square for payments,
            email for notifications) to operate our business.
          </p>
  
          <h2 className="text-xl font-semibold">Security</h2>
          <p>
            We use reasonable safeguards to protect your info. No method is 100% secure.
          </p>
  
          <h2 className="text-xl font-semibold">Your choices</h2>
          <p>
            You can request access, correction, or deletion by emailing{" "}
            <a href="mailto:oilchangeonthespot@gmail.com" className="text-brand underline">
              oilchangeonthespot@gmail.com
            </a>.
          </p>
        </section>
      </div>
    );
  }
  
  