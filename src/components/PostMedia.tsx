import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";

type Props = {
  images: string[];
  alt?: string;
  className?: string;
  imgClassName?: string;
};

export function PostMedia({ images, alt = "", className = "", imgClassName = "w-full max-h-[520px] object-contain" }: Props) {
  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      <div className={className}>
        <img src={images[0]} alt={alt} className={imgClassName} loading="lazy" />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <Carousel className="w-full">
        <CarouselContent>
          {images.map((url, i) => (
            <CarouselItem key={url + i}>
              <img src={url} alt={`${alt} ${i + 1}`} className={imgClassName} loading="lazy" />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-2 size-8 border-line bg-card/90" />
        <CarouselNext className="right-2 size-8 border-line bg-card/90" />
      </Carousel>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 mono-label text-[10px] bg-ink/60 text-paper px-2 py-0.5 rounded-full">
        1 / {images.length}
      </div>
    </div>
  );
}
