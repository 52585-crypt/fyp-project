import { useEffect } from "react";
import { Icon } from "./Icon";

/**
 * Full-screen image viewer. Works with data: URLs, which browsers refuse to open in a new tab.
 * images: [{ label, src }]
 */
export function Lightbox({ images, index, onClose, onIndex }) {
  const open = index != null && images[index];

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % images.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + images.length) % images.length);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, images.length, onClose, onIndex]);

  if (!open) return null;
  const image = images[index];

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={image.label} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-top">
        <span>
          {image.label} · {index + 1} of {images.length}
        </span>
        <button type="button" className="icon-btn lightbox-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {images.length > 1 ? (
        <button type="button" className="lightbox-nav lightbox-prev" aria-label="Previous image" onClick={() => onIndex((index - 1 + images.length) % images.length)}>
          <Icon name="chevronLeft" size={26} />
        </button>
      ) : null}
      <img className="lightbox-img" src={image.src} alt={image.label} />
      {images.length > 1 ? (
        <button type="button" className="lightbox-nav lightbox-next" aria-label="Next image" onClick={() => onIndex((index + 1) % images.length)}>
          <Icon name="chevronRight" size={26} />
        </button>
      ) : null}
    </div>
  );
}
