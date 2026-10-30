import {
  stripHtml,
  toOptionalNumber,
  isValidCoordinate,
} from "../lib/domain.js";
import { normaliseNaverCoord } from "./maps.js";

async function fetchPlaceCandidates(query, runtimeConfig, signal) {
  return (await requestPlaces({ query }, runtimeConfig, signal)).items;
}

async function importSharedPlace(sharedText, runtimeConfig, signal) {
  return requestPlaces({ sharedText }, runtimeConfig, signal);
}

function isNaverSharedText(value) {
  return /https?:\/\/(?:naver\.me|(?:m\.)?map\.naver\.com|(?:m\.|pcmap\.)?place\.naver\.com)(?=[/?#\s]|$)/i.test(
    value,
  );
}

async function requestPlaces(body, runtimeConfig, signal) {
  if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
    throw new Error("Supabase config is missing");
  }

  const endpoint = `${runtimeConfig.supabaseUrl.replace(/\/$/, "")}/functions/v1/naver-place-search`;
  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      apikey: runtimeConfig.supabaseAnonKey,
      Authorization: `Bearer ${runtimeConfig.supabaseAnonKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Place search request failed");
  }

  return {
    ...payload,
    items: Array.isArray(payload.items)
      ? payload.items.map(normalizePlaceCandidate).filter((place) => place.name)
      : [],
  };
}

function normalizePlaceCandidate(item) {
  return {
    name: stripHtml(item.name || item.title || ""),
    category: stripHtml(item.category || ""),
    address: stripHtml(item.address || ""),
    roadAddress: stripHtml(item.roadAddress || ""),
    link: String(item.link || ""),
    lat: toOptionalNumber(item.lat),
    lng: toOptionalNumber(item.lng),
    mapx: toOptionalNumber(item.mapx),
    mapy: toOptionalNumber(item.mapy),
  };
}

function resolvePlaceCoordinate(place) {
  if (isValidCoordinate(place)) {
    return { lat: place.lat, lng: place.lng };
  }

  const scaledLng = place.mapx / 10000000;
  const scaledLat = place.mapy / 10000000;
  if (isValidCoordinate({ lat: scaledLat, lng: scaledLng })) {
    return { lat: scaledLat, lng: scaledLng };
  }

  if (
    window.naver?.maps?.TransCoord?.fromTM128ToLatLng &&
    Number.isFinite(place.mapx) &&
    Number.isFinite(place.mapy)
  ) {
    const convertedCoord = normaliseNaverCoord(
      window.naver.maps.TransCoord.fromTM128ToLatLng(
        new window.naver.maps.Point(place.mapx, place.mapy),
      ),
    );
    return isValidCoordinate(convertedCoord) ? convertedCoord : null;
  }

  return null;
}

export {
  fetchPlaceCandidates,
  importSharedPlace,
  isNaverSharedText,
  resolvePlaceCoordinate,
};
