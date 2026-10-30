import {
  RESTAURANT_PHOTO_BUCKET,
  normalizeRestaurant,
  normalizeRestaurantPhoto,
  normalizeMenuItems,
  normalizeDeliveryApps,
  createId,
} from "../lib/domain.js";
import { rememberReturnRestaurant } from "../lib/routes.js";

const columns =
  "id,group_id,created_by,name,category,rating,vote_round,area,lat,lng,menus,menu_items,delivery_apps,memo,created_at,updated_at";
const photoColumns =
  "id,restaurant_id,storage_path,alt_text,sort_order,created_at";

export class SupabaseRestaurantStore {
  constructor(config) {
    this.url = config.supabaseUrl;
    this.anonKey = config.supabaseAnonKey;
    this.session = null;
    this.userId = null;
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
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    this.setSession(data.session);
    const result = this.client.auth.onAuthStateChange((event, session) => {
      const changed = this.userId !== (session?.user?.id ?? null);
      this.setSession(session);
      if (changed || event === "SIGNED_OUT" || event === "USER_UPDATED")
        window.setTimeout(() => onAuthChange?.({ userChanged: changed }), 0);
    });
    this.authSubscription = result.data.subscription;
  }
  setSession(session) {
    this.session = session ?? null;
    this.userId = session?.user?.id ?? null;
  }
  async getMemberContext() {
    const user = this.session?.user;
    if (!user || user.is_anonymous)
      return { user: null, profile: null, groups: [] };
    const [profile, groups] = await Promise.all([
      this.client
        .from("profiles")
        .select("id,nickname,avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
      this.listGroups(),
    ]);
    if (profile.error) throw profile.error;
    return { user, profile: profile.data, groups };
  }
  async listGroups() {
    const { data, error } = await this.client
      .from("catalog_groups")
      .select("id,name,color,created_at")
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  }
  async createGroup(name, color) {
    const { data, error } = await this.client.rpc("create_catalog_group", {
      p_name: name,
      p_color: color,
    });
    if (error) throw error;
    return data;
  }
  async createInvite(groupId) {
    const { data, error } = await this.client.rpc("create_catalog_invite", {
      p_group_id: groupId,
    });
    if (error) throw error;
    const url = new URL(location.href.split(/[?#]/)[0]);
    url.searchParams.set("invite", data);
    return url.href;
  }
  async joinGroup(token) {
    const { data, error } = await this.client.rpc("join_catalog_group", {
      p_token: token,
    });
    if (error) throw error;
    return data;
  }
  async leaveGroup(groupId) {
    const { data, error } = await this.client.rpc("leave_catalog_group", {
      p_group_id: groupId,
    });
    if (error) throw error;
    return data;
  }
  async signInWithKakao() {
    rememberReturnRestaurant(location.hash);
    const { error } = await this.client.auth.signInWithOAuth({
      provider: "custom:kakao-test",
      options: { redirectTo: location.href.split(/[?#]/)[0] },
    });
    if (error) throw error;
  }
  async signOut() {
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error) throw error;
    this.setSession(null);
  }
  async signedPhotos(rows) {
    if (!rows.length) return [];
    const { data, error } = await this.client.storage
      .from(RESTAURANT_PHOTO_BUCKET)
      .createSignedUrls(
        rows.map((row) => row.storage_path),
        180,
      );
    if (error) throw error;
    const urls = new Map(
      (data ?? []).map((item) => [item.path, item.signedUrl]),
    );
    return rows
      .map((row) =>
        normalizeRestaurantPhoto({
          id: row.id,
          restaurantId: row.restaurant_id,
          storagePath: row.storage_path,
          altText: row.alt_text,
          sortOrder: row.sort_order,
          createdAt: row.created_at,
          url: urls.get(row.storage_path),
        }),
      )
      .filter(Boolean);
  }
  async list() {
    if (!this.userId || this.session?.user?.is_anonymous) return [];
    const [restaurants, photos] = await Promise.all([
      this.client
        .from("restaurants")
        .select(columns)
        .order("rating", { ascending: false })
        .order("name"),
      this.client
        .from("restaurant_photos")
        .select(photoColumns)
        .order("sort_order")
        .order("created_at"),
    ]);
    if (restaurants.error) throw restaurants.error;
    if (photos.error) throw photos.error;
    const signed = await this.signedPhotos(photos.data ?? []);
    return (restaurants.data ?? [])
      .map((row) =>
        fromRow(
          row,
          signed.filter((photo) => photo.restaurantId === row.id),
        ),
      )
      .filter(Boolean);
  }
  async save(restaurant, { isNew, previousRating } = {}) {
    const menuItems = normalizeMenuItems(
      restaurant.menuItems,
      restaurant.menus,
    );
    const payload = {
      name: restaurant.name,
      category: restaurant.category,
      area: restaurant.area,
      lat: restaurant.lat,
      lng: restaurant.lng,
      menus: menuItems.map((item) => item.name),
      menu_items: menuItems,
      delivery_apps: normalizeDeliveryApps(restaurant.deliveryApps),
      memo: restaurant.memo,
    };
    if (isNew || restaurant.rating !== previousRating)
      payload.rating = restaurant.rating;
    if (isNew)
      Object.assign(payload, {
        id: restaurant.id,
        group_id: restaurant.groupId,
        created_by: this.userId,
        rating: restaurant.rating,
      });
    const query = isNew
      ? this.client.from("restaurants").insert(payload)
      : this.client.from("restaurants").update(payload).eq("id", restaurant.id);
    const { data, error } = await query.select(columns).single();
    if (error) throw error;
    return fromRow(data);
  }
  async restaurantPhotos(id) {
    const { data, error } = await this.client
      .from("restaurant_photos")
      .select(photoColumns)
      .eq("restaurant_id", id)
      .order("sort_order")
      .order("created_at");
    if (error) throw error;
    return this.signedPhotos(data ?? []);
  }
  async remove(id) {
    const result = await this.client
      .from("restaurants")
      .delete()
      .eq("id", id)
      .select("id")
      .single();
    if (result.error) throw result.error;
  }
  async discussion(id, cursor = null, signal) {
    const query = this.client.rpc("restaurant_discussion", {
      p_restaurant_id: id,
      p_before: cursor?.created_at ?? null,
      p_before_id: cursor?.id ?? null,
    });
    const { data, error } = await (signal ? query.abortSignal(signal) : query);
    if (error) throw error;
    return data;
  }
  async vote(id, round, choice) {
    const { data, error } = await this.client.rpc("cast_restaurant_vote", {
      p_restaurant_id: id,
      p_round: round,
      p_choice: choice,
    });
    if (error) throw error;
    return data;
  }
  async saveComment(id, body, commentId = null) {
    const table = this.client.from("restaurant_comments");
    const query = commentId
      ? table.update({ body }).eq("id", commentId).eq("restaurant_id", id)
      : table.insert({ restaurant_id: id, user_id: this.userId, body });
    const { error } = await query.select("id").single();
    if (error) throw error;
  }
  async deleteComment(id) {
    const { error } = await this.client
      .from("restaurant_comments")
      .delete()
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
  }
  async addRestaurantPhoto(restaurant, blob, sortOrder) {
    if (!this.userId) throw new Error("not_authenticated");
    const storagePath = `${restaurant.id}/${createId()}.jpg`;
    const bucket = this.client.storage.from(RESTAURANT_PHOTO_BUCKET);
    const upload = await bucket.upload(storagePath, blob, {
      cacheControl: "180",
      contentType: "image/jpeg",
      upsert: false,
    });
    if (upload.error) throw upload.error;
    const { data, error } = await this.client
      .from("restaurant_photos")
      .insert({
        restaurant_id: restaurant.id,
        storage_path: storagePath,
        alt_text: restaurant.name,
        sort_order: sortOrder,
        created_by: this.userId,
      })
      .select(photoColumns)
      .single();
    if (error) {
      await bucket.remove([storagePath]);
      throw error;
    }
    return (await this.signedPhotos([data]))[0];
  }
  async removeRestaurantPhoto(photo) {
    const storage = await this.client.storage
      .from(RESTAURANT_PHOTO_BUCKET)
      .remove([photo.storagePath]);
    if (storage.error) throw storage.error;
    const row = await this.client
      .from("restaurant_photos")
      .delete()
      .eq("id", photo.id)
      .select("id")
      .single();
    if (row.error) throw row.error;
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
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
  }
}

function fromRow(row, photos = []) {
  return normalizeRestaurant({
    ...row,
    groupId: row.group_id,
    createdBy: row.created_by,
    voteRound: row.vote_round,
    menuItems: row.menu_items,
    deliveryApps: row.delivery_apps,
    photos,
  });
}
