"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { DomainRecord } from "@/shared/contracts";
import { portraitFocus, portraitLayout } from "../portrait-layout";
import styles from "./actor-portrait.module.css";

export function ActorPortrait({
  file,
  className = "",
  alt = "",
}: {
  file: DomainRecord;
  className?: string;
  alt?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [image, setImage] = useState({
    width: Number(file.data.width) || 0,
    height: Number(file.data.height) || 0,
  });
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      setFrame({ width: bounds.width, height: bounds.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const layout = portraitLayout(image, frame, portraitFocus(file.data.portraitFocus));
  return (
    <div ref={container} className={`${styles.frame} ${className}`}>
      <Image
        unoptimized
        width={image.width || 1800}
        height={image.height || 1800}
        src={`/api/files/${file.id}`}
        alt={alt}
        loading="lazy"
        className={styles.image}
        style={
          layout
            ? { width: layout.width, height: layout.height, left: layout.left, top: layout.top }
            : undefined
        }
        onLoad={(event) =>
          setImage({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })
        }
      />
    </div>
  );
}
