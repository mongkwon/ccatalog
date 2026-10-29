import {
  STORAGE_KEY,
  SUPABASE_TABLE,
  RESTAURANT_PHOTO_BUCKET,
  seedRestaurants,
  normalizeRestaurant,
  normalizeRestaurantPhotos,
  normalizeRestaurantPhoto,
  normalizeMenuItems,
  normalizeDeliveryApps,
  createId,
  isUuid,
} from "../lib/domain.js";

class LocalRestaurantStore {
  list() {
    return loadLocalRestaurants();
  }

  async save(restaurant) {
    const nextRestaurant = normalizeRestaurant(restaurant);
    const restaurants = loadLocalRestaurants();
    const existingIndex = restaurants.findIndex(
      (item) => item.id === nextRestaurant.id,
    );
    if (existingIndex >= 0) {
      restaurants.splice(existingIndex, 1, nextRestaurant);
    } else {
      restaurants.unshift(nextRestaurant);
    }
    saveLocalRestaurants(restaurants);
    return nextRestaurant;
  }

  async remove(id) {
    saveLocalRestaurants(
      loadLocalRestaurants().filter((restaurant) => restaurant.id !== id),
    );
  }
}

class SupabaseRestaurantStore {
  constructor(config) {
    this.url = config.supabaseUrl;
    this.anonKey = config.supabaseAnonKey;
    this.client = null;
    this.userId = null;
    this.session = null;
    this.authSubscription = null;
  }

  async init(onAuthChange) {
    const { createClient } = await import("@supabase/supabase-js");
    this.client = createClient(this.url, this.anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storageKey: "ccatalog.supabase.auth",
      },
    });

    const { data: sessionData, error: sessionError } =
      await this.client.auth.getSession();
    if (sessionError) throw sessionError;

    this.setSession(sessionData.session);

    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      this.setSession(session);
      window.setTimeout(() => onAuthChange?.(session), 0);
    });
    this.authSubscription = data.subscription;
  }

  setSession(session) {
    this.session = session ?? null;
    this.userId = session?.user?.id ?? null;
  }

  async getMemberContext() {
    const user = this.session?.user ?? null;
    if (!user || user.is_anonymous) {
      return {
        user: null,
        profile: null,
        isAdmin: false,
        visitedRestaurantIds: [],
        visitCount: 0,
        proposals: [],
        adminProposals: [],
      };
    }

    const [profileResult, adminResult, visitsResult, proposalsResult] =
      await Promise.all([
        this.client
          .from("profiles")
          .select("id,nickname,avatar_url,is_catalist,catalist_qualified_at")
          .eq("id", user.id)
          .maybeSingle(),
        this.client
          .from("admin_users")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle(),
        this.client
          .from("restaurant_visits")
          .select("restaurant_id")
          .order("agreed_at", { ascending: true }),
        this.client
          .from("restaurant_proposals")
          .select("id,name,status,created_at")
          .eq("proposer_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

    if (profileResult.error) throw profileResult.error;
    if (adminResult.error) throw adminResult.error;
    if (visitsResult.error) throw visitsResult.error;
    if (proposalsResult.error) throw proposalsResult.error;

    const visitedRestaurantIds = (visitsResult.data ?? []).map(
      (visit) => visit.restaurant_id,
    );
    let adminProposals = [];
    if (adminResult.data) {
      adminProposals = await this.listPendingRestaurantProposals();
    }

    return {
      user,
      profile: profileResult.data,
      isAdmin: Boolean(adminResult.data),
      visitedRestaurantIds,
      visitCount: visitedRestaurantIds.length,
      proposals: proposalsResult.data ?? [],
      adminProposals,
    };
  }

  async signInWithKakao() {
    const redirectTo = window.location.href.split(/[?#]/)[0];
    const { error } = await this.client.auth.signInWithOAuth({
      provider: "custom:kakao-test",
      options: {
        redirectTo,
      },
    });
    if (error) throw error;
  }

  async signOut() {
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error) throw error;
  }

  async confirmRestaurantVisit(restaurant, coords) {
    const { data, error } = await this.client.rpc("confirm_restaurant_visit", {
      p_restaurant_id: restaurant.id,
      p_rating: restaurant.rating,
      p_agrees: true,
      p_lat: coords.lat,
      p_lng: coords.lng,
      p_accuracy: coords.accuracy,
    });
    if (error) throw error;
    if (!data?.[0]) throw new Error("visit_result_missing");
    return data[0];
  }

  async submitRestaurantProposal(restaurant, placeSelection) {
    const { data, error } = await this.client.rpc(
      "submit_restaurant_proposal",
      {
        p_name: restaurant.name,
        p_category: restaurant.category,
        p_suggested_rating: restaurant.rating,
        p_area: restaurant.area,
        p_lat: restaurant.lat,
        p_lng: restaurant.lng,
        p_menu_items: restaurant.menuItems,
        p_delivery_apps: restaurant.deliveryApps,
        p_memo: restaurant.memo,
        p_source_link: placeSelection?.sourceLink || "",
      },
    );
    if (error) throw error;
    if (!data?.[0]) throw new Error("proposal_result_missing");
    return data[0];
  }

  async listPendingRestaurantProposals() {
    const { data, error } = await this.client
      .from("restaurant_proposals")
      .select(
        "id,status,name,category,suggested_rating,area,lat,lng,menu_items,delivery_apps,memo,source_link,created_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async reviewRestaurantProposal(proposalId, decision) {
    const { data, error } = await this.client.rpc(
      "review_restaurant_proposal",
      {
        p_proposal_id: proposalId,
        p_decision: decision,
      },
    );
    if (error) throw error;
    if (!data?.[0]) throw new Error("proposal_review_result_missing");
    return data[0];
  }

  async list() {
    const [restaurantResult, photoResult] = await Promise.all([
      this.client
        .from(SUPABASE_TABLE)
        .select(RESTAURANT_SELECT_COLUMNS)
        .order("rating", { ascending: false })
        .order("name", { ascending: true }),
      this.client
        .from("restaurant_photos")
        .select("id,restaurant_id,storage_path,alt_text,sort_order,created_at")
        .order("restaurant_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (restaurantResult.error) throw restaurantResult.error;
    if (photoResult.error) throw photoResult.error;

    const photosByRestaurant = new Map();
    (photoResult.data ?? []).forEach((row) => {
      const photos = photosByRestaurant.get(row.restaurant_id) ?? [];
      photos.push(
        photoRowToPhoto(row, this.restaurantPhotoUrl(row.storage_path)),
      );
      photosByRestaurant.set(row.restaurant_id, photos);
    });

    return (restaurantResult.data ?? [])
      .map((row) => rowToRestaurant(row, photosByRestaurant.get(row.id) ?? []))
      .filter(Boolean);
  }

  async save(restaurant, { isNew } = {}) {
    const payload = restaurantToRow(restaurant, { includeId: isNew });
    let query;

    if (isNew) {
      query = this.client.from(SUPABASE_TABLE).insert(payload);
    } else {
      query = this.client
        .from(SUPABASE_TABLE)
        .update(payload)
        .eq("id", restaurant.id);
    }

    const { data, error } = await query
      .select(RESTAURANT_SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return rowToRestaurant(data);
  }

  async remove(id) {
    const { data: photos, error: photoQueryError } = await this.client
      .from("restaurant_photos")
      .select("storage_path")
      .eq("restaurant_id", id);
    if (photoQueryError) throw photoQueryError;

    const paths = (photos ?? []).map((photo) => photo.storage_path);
    if (paths.length) {
      const { error: storageError } = await this.client.storage
        .from(RESTAURANT_PHOTO_BUCKET)
        .remove(paths);
      if (storageError) throw storageError;
    }

    const { error } = await this.client
      .from(SUPABASE_TABLE)
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  restaurantPhotoUrl(storagePath) {
    return this.client.storage
      .from(RESTAURANT_PHOTO_BUCKET)
      .getPublicUrl(storagePath).data.publicUrl;
  }

  async addRestaurantPhoto(restaurant, blob, sortOrder) {
    if (!this.userId) throw new Error("not_authenticated");
    const storagePath = `${restaurant.id}/${createId()}.jpg`;
    const { error: uploadError } = await this.client.storage
      .from(RESTAURANT_PHOTO_BUCKET)
      .upload(storagePath, blob, {
        cacheControl: "31536000",
        contentType: "image/jpeg",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data, error } = await this.client
      .from("restaurant_photos")
      .insert({
        restaurant_id: restaurant.id,
        storage_path: storagePath,
        alt_text: restaurant.name,
        sort_order: sortOrder,
        created_by: this.userId,
      })
      .select("id,restaurant_id,storage_path,alt_text,sort_order,created_at")
      .single();

    if (error) {
      await this.client.storage
        .from(RESTAURANT_PHOTO_BUCKET)
        .remove([storagePath]);
      throw error;
    }

    return photoRowToPhoto(data, this.restaurantPhotoUrl(storagePath));
  }

  async removeRestaurantPhoto(photo) {
    const { error: storageError } = await this.client.storage
      .from(RESTAURANT_PHOTO_BUCKET)
      .remove([photo.storagePath]);
    if (storageError) throw storageError;

    const { error: rowError } = await this.client
      .from("restaurant_photos")
      .delete()
      .eq("id", photo.id);
    if (rowError) throw rowError;
  }

  async updateRestaurantPhotoOrder(photos) {
    const results = await Promise.all(
      photos.map((photo, index) =>
        this.client
          .from("restaurant_photos")
          .update({ sort_order: index })
          .eq("id", photo.id),
      ),
    );
    const failedResult = results.find((result) => result.error);
    if (failedResult?.error) throw failedResult.error;
  }
}

const RESTAURANT_SELECT_COLUMNS = [
  "id",
  "name",
  "category",
  "rating",
  "area",
  "lat",
  "lng",
  "menus",
  "menu_items",
  "delivery_apps",
  "memo",
  "created_at",
  "updated_at",
].join(",");

function rowToRestaurant(row, photos = []) {
  return normalizeRestaurant({
    id: row.id,
    name: row.name,
    category: row.category,
    rating: row.rating,
    area: row.area,
    lat: row.lat,
    lng: row.lng,
    menus: row.menus,
    menuItems: row.menu_items,
    deliveryApps: row.delivery_apps,
    memo: row.memo,
    photos,
  });
}

function photoRowToPhoto(row, url) {
  return normalizeRestaurantPhoto({
    id: row.id,
    restaurantId: row.restaurant_id,
    storagePath: row.storage_path,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    url,
  });
}

function restaurantToRow(restaurant, { includeId = true } = {}) {
  const menuItems = normalizeMenuItems(restaurant.menuItems, restaurant.menus);
  const row = {
    name: restaurant.name,
    category: restaurant.category,
    rating: restaurant.rating,
    area: restaurant.area,
    lat: restaurant.lat,
    lng: restaurant.lng,
    menus: menuItems.map((item) => item.name),
    menu_items: menuItems,
    delivery_apps: normalizeDeliveryApps(restaurant.deliveryApps),
    memo: restaurant.memo,
  };

  if (includeId && isUuid(restaurant.id)) {
    row.id = restaurant.id;
  }

  return row;
}

function hasLocalRestaurantData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function loadLocalRestaurants() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw)
      return structuredClone(seedRestaurants)
        .map(normalizeRestaurant)
        .filter(Boolean);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed))
      return structuredClone(seedRestaurants)
        .map(normalizeRestaurant)
        .filter(Boolean);
    return parsed.map(normalizeRestaurant).filter(Boolean);
  } catch {
    return structuredClone(seedRestaurants)
      .map(normalizeRestaurant)
      .filter(Boolean);
  }
}

function saveLocalRestaurants(restaurants) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(restaurants));
}

export {
  LocalRestaurantStore,
  SupabaseRestaurantStore,
  hasLocalRestaurantData,
};
