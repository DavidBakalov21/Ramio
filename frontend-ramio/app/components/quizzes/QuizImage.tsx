import Image from 'next/image';

export function QuizImage({ url, alt = 'Image' }: { url: string; alt?: string }) {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <Image
        src={url}
        alt={alt}
        width={800}
        height={400}
        className="h-auto max-h-72 w-full object-contain"
        unoptimized
      />
    </div>
  );
}
