export const metadata = {
    title: 'Gallery',
    description: 'A look at our recent mobile oil changes around HRM.',
  };
  
  const IMAGES = [
    // Put your files in /public/gallery/
    { src: '/gallery/work-01.jpg', alt: 'On-site oil change' },
    { src: '/gallery/work-02.jpg', alt: 'Filter replacement' },
    { src: '/gallery/work-05.png', alt: 'Sedan service' },
    { src: '/gallery/work-06.png', alt: 'SUV service' },
    { src: '/gallery/work-07.png', alt: 'Truck service' },
    { src: '/gallery/work-08.jpg', alt: 'European service' },
  ];
  
  export default function GalleryPage() {
    return (
      <div className="container py-12 space-y-6">
        <h1 className="text-3xl font-bold">Gallery</h1>
        <p className="text-slate-600">
          A few snapshots from recent services—fast, clean, and professional.
        </p>
  
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {IMAGES.map((img, i) => (
            <figure key={i} className="overflow-hidden rounded-xl border bg-white">
              <img
                src={img.src}
                alt={img.alt}
                className="h-48 w-full object-cover hover:scale-[1.02] transition"
                loading="lazy"
              />
            </figure>
          ))}
        </div>
  
        <p className="text-slate-500 text-sm">
          Want your car featured? Tag us on Instagram @oilchangeonthespot!
        </p>
      </div>
    );
  }
  