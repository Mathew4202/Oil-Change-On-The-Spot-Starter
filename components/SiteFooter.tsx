export default function SiteFooter() {
  return (
    <footer role="contentinfo" className="border-t bg-white">
      <div className="container pt-6 pb-24 md:py-6 text-sm text-slate-600 grid gap-4 md:grid-cols-4">
        <div className="font-semibold text-slate-900">© {new Date().getFullYear()} Oil Change On The Spot</div>
        <div>Dartmouth & HRM • We come to you</div>
        <div>
          <a href="tel:+19024120344" className="hover:underline">Call/Text: (902) 412-0344</a><br/>
          <a href="mailto:oilchangeonthespot@gmail.com" className="hover:underline">oilchangeonthespot@gmail.com</a>
        </div>
        <div className="md:text-right">Powered by HRC Advertising</div>
      </div>
    </footer>
  );
}
