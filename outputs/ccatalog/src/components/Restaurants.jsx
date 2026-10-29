import { useRef, useState } from "react";
import { RatingBadge } from "./common.jsx";
import {
  deliveryLabels,
  deliverySummary,
  distanceKmBetween,
  isValidCoordinate,
  menuItemsSummary,
  menuItemLabel,
  RATING_META,
  VISIT_RADIUS_METERS,
  VISIT_MAX_ACCURACY_METERS,
  VISIT_LOCATION_TIMEOUT_MS,
  visitErrorMessage,
} from "../lib/domain.js";

export function RestaurantList({ restaurants, selectedId, open, onSelect }) {
  return (
    <aside
      id="restaurantPanel"
      className={`restaurant-panel${open ? " is-open" : ""}`}
      aria-label="맛집 목록"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="panel-meta">
        <strong id="resultCount">{restaurants.length}곳</strong>
      </div>
      <div id="restaurantList" className="restaurant-list">
        {!restaurants.length && (
          <div className="empty-state">조건에 맞는 맛집이 없습니다</div>
        )}
        {restaurants.map((restaurant) => {
          const preview = [
            menuItemsSummary(restaurant.menuItems, 2),
            deliverySummary(restaurant.deliveryApps),
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <button
              key={restaurant.id}
              type="button"
              className={`restaurant-item${selectedId === restaurant.id ? " is-selected" : ""}`}
              onClick={() => onSelect(restaurant.id)}
            >
              <div className="item-head">
                <div>
                  <h3>{restaurant.name}</h3>
                  <p className="item-sub">
                    {[restaurant.category, restaurant.area]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <RatingBadge rating={restaurant.rating} />
              </div>
              {preview && <p className="item-menu-preview">{preview}</p>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function RestaurantDetail({
  restaurant,
  catalog,
  userLocation,
  onLocation,
  onLogin,
  onEdit,
  onPhotos,
  onDelete,
  onViewPhoto,
}) {
  return (
    <article
      id="selectedCard"
      className={`selected-card${restaurant ? "" : " hidden"}`}
      aria-live="polite"
    >
      {restaurant && (
        <>
          {!!restaurant.photos.length && (
            <div
              className="restaurant-photo-gallery"
              data-count={restaurant.photos.length}
              aria-label={`${restaurant.name} 사진`}
            >
              {restaurant.photos.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  className="restaurant-photo-button"
                  aria-label={`사진 ${index + 1} 크게 보기`}
                  onClick={() => onViewPhoto(restaurant.id, index)}
                >
                  <img
                    src={photo.url}
                    alt={photo.altText || restaurant.name}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              ))}
            </div>
          )}
          <div className="card-layout">
            <div className="card-main">
              <h2>{restaurant.name}</h2>
              <p className="card-sub">
                {[restaurant.category, restaurant.area]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {!!restaurant.menuItems.length && (
                <div className="menu-row">
                  {restaurant.menuItems.map((menu) => (
                    <span key={menu.name} className="menu-chip">
                      {menuItemLabel(menu)}
                    </span>
                  ))}
                </div>
              )}
              {!!restaurant.deliveryApps.length && (
                <div className="delivery-row">
                  {deliveryLabels(restaurant.deliveryApps).map((label) => (
                    <span key={label} className="delivery-chip">
                      {label}
                    </span>
                  ))}
                </div>
              )}
              {restaurant.memo && <p className="memo">{restaurant.memo}</p>}
              <VisitControl
                key={restaurant.id}
                restaurant={restaurant}
                catalog={catalog}
                userLocation={userLocation}
                onLocation={onLocation}
                onLogin={onLogin}
              />
            </div>
            <div className="card-side">
              <RatingBadge rating={restaurant.rating} />
              <div className="card-actions">
                <a
                  className="link-button"
                  href={`https://map.naver.com/p/search/${encodeURIComponent(restaurant.name)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  네이버지도
                </a>
                {catalog.isAdmin && (
                  <>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onPhotos(restaurant)}
                    >
                      사진
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onEdit(restaurant)}
                    >
                      수정
                    </button>
                    <button
                      className="secondary-button danger-button"
                      type="button"
                      onClick={() => onDelete(restaurant)}
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

function nearby(restaurant, location) {
  return (
    location &&
    isValidCoordinate(location) &&
    Number.isFinite(location.accuracy) &&
    location.accuracy <= VISIT_MAX_ACCURACY_METERS &&
    Math.round(distanceKmBetween(location, restaurant) * 1000) <=
      VISIT_RADIUS_METERS
  );
}

export function getVisitLocation() {
  if (!navigator.geolocation)
    return Promise.reject(new Error("location_unavailable"));
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
          accuracy: Number(position.coords.accuracy),
        }),
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? "location_denied"
              : error.code === 3
                ? "location_timeout"
                : "location_unavailable",
          ),
        ),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: VISIT_LOCATION_TIMEOUT_MS,
      },
    ),
  );
}

function VisitControl({
  restaurant,
  catalog,
  userLocation,
  onLocation,
  onLogin,
}) {
  const { auth, isMember, storeRef, syncAuth } = catalog;
  const [flow, setFlow] = useState({
    step: "prompt",
    message: "",
    coords: null,
  });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const isNearby = nearby(restaurant, userLocation);
  const distance = userLocation
    ? Math.round(distanceKmBetween(userLocation, restaurant) * 1000)
    : null;
  const distanceLabel =
    distance === null
      ? "현재 위치 확인 중"
      : distance < 1000
        ? `${distance.toLocaleString("ko-KR")}m 거리`
        : `${(distance / 1000).toFixed(distance < 10000 ? 1 : 0)}km 거리`;
  const confirmed = auth.visitedRestaurantIds.includes(restaurant.id);
  async function begin() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const location = await getVisitLocation();
      onLocation(location);
      if (!nearby(restaurant, location))
        throw new Error(
          distanceKmBetween(location, restaurant) * 1000 > VISIT_RADIUS_METERS
            ? "too_far"
            : "location_inaccurate",
        );
      setFlow({ step: "agreement", coords: location, message: "" });
    } catch (error) {
      setFlow({
        step: "prompt",
        message: visitErrorMessage(error),
        error: true,
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function agree() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await storeRef.current.confirmRestaurantVisit(
        restaurant,
        flow.coords,
      );
      await syncAuth();
      setFlow({
        step: "success",
        message: result.is_catalist
          ? "까탈리스트가 되었어요! 이제 새로운 맛집을 건의할 수 있어요."
          : `앞으로 ${Math.max(0, 3 - result.visit_count)}곳만 더 방문하면 까탈리스트가 돼요.`,
      });
    } catch (error) {
      setFlow({
        step: "prompt",
        message: visitErrorMessage(error),
        error: true,
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (confirmed)
    return (
      <div className="visit-verification is-confirmed">
        <span className="visit-confirmed-label">방문 확인됨</span>
        <p className="visit-feedback">
          {flow.step === "success"
            ? flow.message
            : "이 음식점의 방문 인증을 완료했어요."}
        </p>
      </div>
    );
  if (!isMember)
    return (
      <div
        className={`visit-verification${isNearby ? " is-nearby" : " is-locked"}`}
      >
        <p className="visit-title">
          {isNearby
            ? `현재 ${restaurant.name} 근처에 있어요!`
            : "500m 안에 도착하면 방문 인증이 열려요"}
        </p>
        <p className="visit-distance">{distanceLabel}</p>
        {isNearby && (
          <button
            className="visit-login-button"
            type="button"
            onClick={onLogin}
          >
            로그인하고 방문 인증
          </button>
        )}
      </div>
    );
  if (!isNearby)
    return (
      <div className="visit-verification is-locked">
        <p className="visit-title">500m 안에 도착하면 방문 인증이 열려요</p>
        <p className="visit-distance">{distanceLabel}</p>
      </div>
    );
  if (flow.step === "declined")
    return (
      <div className="visit-verification is-declined">
        <p className="visit-title">
          취향에 맞지 않으셨군요. 다른 맛집에서도 방문 인증을 해보세요.
        </p>
      </div>
    );
  if (flow.step === "agreement")
    return (
      <div className="visit-verification is-nearby">
        <p className="visit-title">
          {RATING_META[restaurant.rating].icon}{" "}
          {RATING_META[restaurant.rating].label} 평가에 동의하시나요?
        </p>
        <div className="visit-choice-row">
          <button
            className="visit-choice-button"
            type="button"
            disabled={busy}
            onClick={() => setFlow({ step: "declined" })}
          >
            아니요
          </button>
          <button
            className="visit-confirm-button"
            type="button"
            disabled={busy}
            onClick={agree}
          >
            {busy ? "확인 중" : "네"}
          </button>
        </div>
      </div>
    );
  return (
    <div className="visit-verification is-nearby">
      <p className="visit-title">현재 {restaurant.name} 근처에 있어요!</p>
      <p className="visit-distance">{distanceLabel} · 방문 인증할까요?</p>
      <button
        className="visit-confirm-button"
        type="button"
        disabled={busy}
        onClick={begin}
      >
        {busy ? "위치 확인 중" : "방문 인증"}
      </button>
      <p
        className={`visit-feedback${flow.error ? " is-error" : ""}`}
        aria-live="polite"
      >
        {flow.message}
      </p>
    </div>
  );
}
