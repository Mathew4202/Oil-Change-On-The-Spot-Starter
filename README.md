# Oil Change On The Spot — Starter (Next.js + Tailwind)

**Stack:** TypeScript + Next.js (App Router) + Tailwind CSS  
**Editor:** VS Code  
**Deploy:** Vercel or Cloudflare Pages  

## 1) Install
```bash
npm install
```

## 2) Run dev
```bash
npm run dev
```
Site runs at http://localhost:3000

## 3) Theme
- White background, professional blue accents in `tailwind.config.ts`.
- Logo is `/public/logo.svg` shown in the header.

## 4) Booking with Square
- The `/book` page loads your Square embed script. If your script changes, update the URL in that page.

## 5) Next steps
- Add Instant Quote component to compute final pricing by capacity & oil type.
- Add SEO metadata & JSON-LD for local business.
- Connect `/api/quote` to email or a sheet/DB.
