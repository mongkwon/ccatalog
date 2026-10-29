import { useEffect, useRef } from "react";
import { usePresence } from "./common.jsx";

export function PhotoViewer({ restaurant, index, onIndex, onClose }) {
  const { mounted, active } = usePresence(Boolean(restaurant));
  const previous = useRef(null);
  if (restaurant) previous.current = restaurant;
  const visible = restaurant || previous.current;
  const photo = visible?.photos[index];
  useEffect(() => {
    if (!restaurant) return;
    const keydown = (event) => {
      if (event.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
      if (event.key === "ArrowRight")
        onIndex(Math.min(restaurant.photos.length - 1, index + 1));
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [restaurant, index, onIndex]);
  return (
    <section
      id="photoViewer"
      className={`photo-viewer${active ? " is-open" : ""}`}
      role="dialog"
      aria-label="음식점 사진"
      aria-hidden={!restaurant}
      inert={!restaurant}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {mounted && photo && (
        <>
          <button
            className="photo-viewer-close"
            type="button"
            aria-label="사진 닫기"
            title="닫기"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
          <button
            className="photo-viewer-nav is-previous"
            type="button"
            aria-label="이전 사진"
            title="이전 사진"
            disabled={index === 0}
            onClick={() => onIndex(index - 1)}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <figure className="photo-viewer-figure">
            <img src={photo.url} alt={photo.altText || visible.name} />
            <figcaption>
              {visible.name} · {index + 1} / {visible.photos.length}
            </figcaption>
          </figure>
          <button
            className="photo-viewer-nav is-next"
            type="button"
            aria-label="다음 사진"
            title="다음 사진"
            disabled={index === visible.photos.length - 1}
            onClick={() => onIndex(index + 1)}
          >
            <span aria-hidden="true">›</span>
          </button>
        </>
      )}
    </section>
  );
}
