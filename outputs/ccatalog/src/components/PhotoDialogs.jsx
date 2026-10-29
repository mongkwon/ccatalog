import { useEffect, useRef, useState } from "react";
import { Modal, usePresence } from "./common.jsx";
import {
  RESTAURANT_PHOTO_LIMIT,
  normalizeRestaurantPhotos,
  photoErrorMessage,
} from "../lib/domain.js";
import { prepareRestaurantPhoto } from "../lib/photos.js";

export function PhotoManager({
  open,
  restaurant,
  storeRef,
  onUpdate,
  onClose,
  canEdit,
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const lock = useRef(false);
  const input = useRef(null);
  const photos = restaurant?.photos ?? [];
  useEffect(() => {
    if (open) {
      setStatus("");
      setError(false);
    }
  }, [open, restaurant?.id]);

  async function upload(event) {
    const selected = [...event.target.files];
    event.target.value = "";
    if (!canEdit || lock.current || !selected.length || !restaurant) return;
    lock.current = true;
    setBusy(true);
    setError(false);
    const files = selected.slice(0, RESTAURANT_PHOTO_LIMIT - photos.length);
    const uploaded = [];
    try {
      for (const [index, file] of files.entries()) {
        setStatus(`${index + 1} / ${files.length} 사진 처리 중`);
        const blob = await prepareRestaurantPhoto(file);
        uploaded.push(
          await storeRef.current.addRestaurantPhoto(
            restaurant,
            blob,
            photos.length + uploaded.length,
          ),
        );
      }
      setStatus(
        selected.length > files.length
          ? `사진을 추가했습니다 · ${selected.length - files.length}장은 제한으로 제외됐습니다`
          : "사진을 추가했습니다",
      );
    } catch (error) {
      setError(true);
      setStatus(photoErrorMessage(error));
    } finally {
      if (uploaded.length)
        onUpdate({
          ...restaurant,
          photos: normalizeRestaurantPhotos([...photos, ...uploaded]),
        });
      lock.current = false;
      setBusy(false);
    }
  }
  async function change(photo, action) {
    if (!canEdit || lock.current) return;
    if (action === "delete" && !window.confirm("이 사진을 삭제할까요?")) return;
    lock.current = true;
    setBusy(true);
    setError(false);
    let next = [...photos];
    let deleted = false;
    try {
      if (action === "delete") {
        setStatus("사진 삭제 중");
        await storeRef.current.removeRestaurantPhoto(photo);
        deleted = true;
        next = next.filter((item) => item.id !== photo.id);
      } else {
        setStatus("순서 변경 중");
        const index = next.findIndex((item) => item.id === photo.id);
        const target = index + (action === "previous" ? -1 : 1);
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
      }
      next = next.map((item, index) => ({ ...item, sortOrder: index }));
      await storeRef.current.updateRestaurantPhotoOrder(next);
      onUpdate({ ...restaurant, photos: next });
      setStatus(
        action === "delete"
          ? "사진을 삭제했습니다"
          : "사진 순서를 변경했습니다",
      );
    } catch (error) {
      if (deleted) onUpdate({ ...restaurant, photos: next });
      setError(true);
      setStatus(photoErrorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const disabled = busy || !canEdit || photos.length >= RESTAURANT_PHOTO_LIMIT;
  return (
    <Modal
      id="photoDialog"
      className="photo-modal"
      labelId="photoDialogTitle"
      open={open}
    >
      <div className="modal-card photo-modal-card">
        <div className="modal-header photo-modal-header">
          <div>
            <h2 id="photoDialogTitle">{restaurant?.name} 사진</h2>
            <p id="photoDialogCount">
              {photos.length} / {RESTAURANT_PHOTO_LIMIT}
            </p>
          </div>
          <button
            className="icon-button photo-dialog-close"
            type="button"
            aria-label="사진 관리 닫기"
            title="닫기"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="photo-manager-list" aria-label="등록된 사진">
          {photos.length ? (
            photos.map((photo, index) => (
              <article key={photo.id} className="photo-manager-item">
                <img src={photo.url} alt={photo.altText || restaurant.name} />
                <div className="photo-manager-actions">
                  <button
                    type="button"
                    aria-label="사진 앞으로 이동"
                    title="앞으로"
                    disabled={busy || index === 0 || !canEdit}
                    onClick={() => change(photo, "previous")}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="사진 뒤로 이동"
                    title="뒤로"
                    disabled={busy || index === photos.length - 1 || !canEdit}
                    onClick={() => change(photo, "next")}
                  >
                    ›
                  </button>
                  <button
                    className="photo-delete-button"
                    type="button"
                    disabled={busy || !canEdit}
                    onClick={() => change(photo, "delete")}
                  >
                    삭제
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="photo-manager-empty">등록된 사진이 없습니다</div>
          )}
        </div>
        <div className="photo-manager-footer">
          <p
            className={`photo-manager-status${error ? " is-error" : ""}`}
            aria-live="polite"
          >
            {status}
          </p>
          <label
            className={`photo-upload-button${disabled ? " is-disabled" : ""}`}
            htmlFor="photoUploadInput"
          >
            사진 추가
          </label>
          <input
            ref={input}
            id="photoUploadInput"
            className="visually-hidden"
            type="file"
            accept="image/*"
            multiple
            disabled={disabled}
            onChange={upload}
          />
        </div>
      </div>
    </Modal>
  );
}

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
