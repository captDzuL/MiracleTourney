"use client";

import { useState } from "react";
import Image from "next/image";

type Dimensions = { width: number; height: number };

type IntrinsicImageProps = {
  src: string;
  alt: string;
  heightRem: number;
  constrainToParent?: boolean;
  className?: string;
  frameClassName?: string;
  "data-certificate-preview"?: boolean;
};

export function IntrinsicImage(props: IntrinsicImageProps) {
  return <MeasuredImage key={props.src} {...props} />;
}

function MeasuredImage({ src, alt, heightRem, constrainToParent = true, className, frameClassName, ...rest }: IntrinsicImageProps) {
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [failed, setFailed] = useState(false);
  const naturalWidth = dimensions ? `${heightRem * dimensions.width / dimensions.height}rem` : "0px";
  const width = constrainToParent && dimensions ? `min(100%, ${naturalWidth})` : naturalWidth;

  if (failed) return <span role="img" aria-label={alt}>{alt}</span>;

  return (
    <span className={`relative block ${frameClassName ?? ""}`} style={{ position: "relative", width, height: constrainToParent ? undefined : `${heightRem}rem`, aspectRatio: constrainToParent && dimensions ? `${dimensions.width} / ${dimensions.height}` : undefined }}>
      <Image
        {...rest}
        src={src}
        alt={alt}
        fill
        sizes="100vw"
        loading="eager"
        unoptimized
        className={className}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) setDimensions({ width: naturalWidth, height: naturalHeight });
        }}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
