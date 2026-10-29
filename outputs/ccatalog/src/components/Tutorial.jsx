import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RATING_META, TUTORIAL_STEPS } from "../lib/domain.js";

export default function Tutorial({ open, onClose }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const nextButton = useRef(null);
  const step = TUTORIAL_STEPS[index];
  useEffect(() => {
    if (open) {
      setIndex(0);
      nextButton.current?.focus({ preventScroll: true });
    }
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const target =
      document.getElementById(step.target) ||
      document.querySelector(
        `.${step.target === "bottomDock" ? "bottom-dock" : step.target}`,
      );
    if (!target) return;
    const update = () => {
      const bounds = target.getBoundingClientRect();
      const padding = step.target === "adminButton" ? 7 : 8;
      const left = Math.max(8, bounds.left - padding);
      const top = Math.max(8, bounds.top - padding);
      setRect({
        left,
        top,
        width: Math.max(
          1,
          Math.min(innerWidth - 8, bounds.right + padding) - left,
        ),
        height: Math.max(
          1,
          Math.min(innerHeight - 8, bounds.bottom + padding) - top,
        ),
        borderRadius: step.target === "restaurantPanel" ? "34px" : "999px",
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [open, step]);
  return (
    <section
      id="tutorialOverlay"
      className={`tutorial-overlay${open ? " is-open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorialTitle"
      aria-hidden={!open}
      inert={!open}
    >
      <div
        className="tutorial-spotlight"
        aria-hidden="true"
        style={rect ?? {}}
      />
      <article className="tutorial-card" data-placement={step.placement}>
        <header className="tutorial-header">
          <span>
            {index + 1} / {TUTORIAL_STEPS.length}
          </span>
          <button type="button" onClick={onClose}>
            건너뛰기
          </button>
        </header>
        <div className="tutorial-copy">
          <h2 id="tutorialTitle">{step.title}</h2>
          <p>{step.description}</p>
        </div>
        <div className="tutorial-visual">
          {step.visual === "ratings" ? (
            <div className="tutorial-medals" aria-label="메달 등급">
              {Object.values(RATING_META).map((meta) => (
                <span key={meta.label}>
                  <b aria-hidden="true">{meta.icon}</b> {meta.label}
                </span>
              ))}
            </div>
          ) : step.visual === "catalist" ? (
            <div
              className="tutorial-catalist-path"
              aria-label="까탈리스트들의 그룹 공유"
            >
              <strong>까탈리스트</strong>
              <i>↔</i>
              <strong>우리 그룹</strong>
            </div>
          ) : (
            <div className="tutorial-purpose" aria-label="까탈로그의 기준">
              <img src={`${import.meta.env.BASE_URL}brand-mark.svg`} alt="" />
              <span>엄격한 취향으로 고른 맛집만</span>
            </div>
          )}
        </div>
        <footer className="tutorial-footer">
          <div className="tutorial-dots" aria-hidden="true">
            {TUTORIAL_STEPS.map((_, i) => (
              <span key={i} className={i === index ? "is-active" : ""} />
            ))}
          </div>
          <div className="tutorial-actions">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              이전
            </button>
            <button
              ref={nextButton}
              className="tutorial-next"
              type="button"
              onClick={() =>
                index === TUTORIAL_STEPS.length - 1
                  ? onClose()
                  : setIndex(index + 1)
              }
            >
              {index === TUTORIAL_STEPS.length - 1 ? "시작하기" : "다음"}
            </button>
          </div>
        </footer>
      </article>
    </section>
  );
}
