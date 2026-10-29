import { RatingBadge } from "./common.jsx";
import {
  deliveryLabels,
  deliverySummary,
  menuItemsSummary,
  menuItemLabel,
} from "../lib/domain.js";
import { placeKey } from "../lib/groups.js";

export function GroupLabel({ group }) {
  return group ? (
    <span className="group-label">
      <i style={{ backgroundColor: group.color }} />
      {group.name}
    </span>
  ) : null;
}

export function RestaurantList({
  restaurants,
  selectedId,
  open,
  onSelect,
  emptyMessage,
}) {
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
          <div className="empty-state">
            {emptyMessage || "조건에 맞는 맛집이 없습니다"}
          </div>
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
                  <h3>
                    {restaurant.group && (
                      <i
                        className="item-group-dot"
                        style={{ backgroundColor: restaurant.group.color }}
                        title={restaurant.group.name}
                      />
                    )}
                    <span>{restaurant.name}</span>
                  </h3>
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
  onEdit,
  onDelete,
  onViewPhoto,
  onDiscussion,
}) {
  const alternatives = restaurant
    ? catalog.restaurants.filter((item) => samePlace(item, restaurant))
    : [];
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
              <GroupLabel group={restaurant.group} />
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
              <button
                type="button"
                className="secondary-button discussion-open"
                onClick={() => onDiscussion(restaurant)}
              >
                의견 · 메달 투표
              </button>
              {alternatives.length > 1 && (
                <div className="group-records" aria-label="그룹별 메달">
                  {alternatives.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className="secondary-button"
                      onClick={() => catalog.onSelectRecord(item.id)}
                      aria-pressed={item.id === restaurant.id}
                    >
                      {
                        catalog.auth.groups.find(
                          (group) => group.id === item.groupId,
                        )?.name
                      }{" "}
                      <RatingBadge rating={item.rating} />
                    </button>
                  ))}
                </div>
              )}
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
                {catalog.ownsRestaurant(restaurant) && (
                  <>
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

function samePlace(first, second) {
  return placeKey(first) === placeKey(second);
}
