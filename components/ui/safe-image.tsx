"use client";
import { useState } from "react";
import Image, { type ImageProps } from "next/image";

/** next/image yang tidak meninggalkan ikon gambar rusak: bila gagal dimuat, tampil `fallback` (default: kosong). */
export function SafeImage({ fallback = null, ...props }: ImageProps & { fallback?: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  // eslint-disable-next-line jsx-a11y/alt-text -- alt diteruskan dari props
  return <Image {...props} onError={(e) => { setFailed(true); props.onError?.(e); }} />;
}
