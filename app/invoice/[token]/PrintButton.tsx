"use client";
export default function PrintButton() {
  return <button onClick={() => window.print()} className="h-12 px-5 rounded-xl font-extrabold" style={{ background: "#f2b01e", color: "#0d1b3e" }}>Print or save as PDF</button>;
}
