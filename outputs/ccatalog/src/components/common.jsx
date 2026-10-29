import { useEffect, useState } from "react";
import { RATING_META } from "../lib/domain.js";

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m21 21-5-5m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
    </svg>
  );
}

export function RatingBadge({ rating }) {
  const meta = RATING_META[rating];
  return (
    <span className="rating-badge" data-rating={rating} aria-label={meta.label}>
      <span aria-hidden="true">{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
}

export function usePresence(open) {
  const [mounted, setMounted] = useState(open);
  const [active, setActive] = useState(false);
  useEffect(() => {
    let frame;
    let secondFrame;
    let timer;
    if (open) {
      setMounted(true);
      frame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => setActive(true));
      });
    } else {
      setActive(false);
      timer = setTimeout(() => setMounted(false), 350);
    }
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
      clearTimeout(timer);
    };
  }, [open]);
  return { mounted, active: open && active };
}

export function Modal({ open, id, labelId, className = "", children }) {
  const { mounted, active } = usePresence(open);
  return (
    <section
      id={id}
      className={`modal ${className}${active ? " is-open" : ""}`}
      role="dialog"
      aria-labelledby={labelId}
      aria-hidden={!open}
      inert={!open}
    >
      {mounted && children}
    </section>
  );
}
