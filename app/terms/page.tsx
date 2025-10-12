export const metadata = {
    title: 'Terms of Service',
    description: 'Terms for using Oil Change On The Spot services and website.',
  };
  
  export default function TermsPage() {
    return (
      <div className="container py-12 space-y-6">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="text-slate-600 text-sm">
          Last updated: {new Date().toLocaleDateString()}
        </p>
  
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Services</h2>
            <p>
              We provide mobile oil change services by appointment within HRM. Quotes are
              estimates and may adjust based on oil capacity, filter type, and vehicle
              condition.
            </p>
          </div>
  
          <div>
            <h2 className="text-xl font-semibold">Appointments & Access</h2>
            <p>
              You confirm we may service your vehicle at the provided location and time, with
              safe, legal access. If conditions are unsafe or prevent service, we may need to
              reschedule.
            </p>
          </div>
  
          <div>
            <h2 className="text-xl font-semibold">Payments & Invoicing</h2>
            <p>
              Payment is due upon service completion. Preferred method is <b>cash</b>, but we
              also accept e-transfer and card payments through Square. Invoices and receipts
              can be provided upon request.
            </p>
          </div>
  
          <div>
            <h2 className="text-xl font-semibold">Warranties & Liability</h2>
            <p>
              We use quality oil and filters matched to your vehicle. Our liability is limited
              to the cost of the service provided.
            </p>
          </div>
  
          <div>
            <h2 className="text-xl font-semibold">Contact</h2>
            <p>
              Questions? Email{' '}
              <a
                href="mailto:oilchangeonthespot@gmail.com"
                className="text-brand underline"
              >
                oilchangeonthespot@gmail.com
              </a>
              .
            </p>
          </div>
        </section>
      </div>
    );
  }
  