import PriceCalculator from '../../components/PriceCalculator';



export default function QuotePage() {
  return (
    <div className="container py-12 space-y-6">
      <h1 className="text-3xl font-bold">Get a Quote here</h1>
      <p className="text-slate-600">Enter your vehicle details to see a price. Note prices may differ from quote</p>
      <PriceCalculator />
    </div>
  )
}
