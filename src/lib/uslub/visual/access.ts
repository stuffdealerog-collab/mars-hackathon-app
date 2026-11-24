/**
 * Who may CHANGE a brand's pictures (learn its style, add photos, start or replace a post picture).
 * Reading follows access.ts canAccessBrand (public channel_only brands are readable by anyone with the
 * id). Writing is stricter: once a brand has an owner (claimed through the bot), only that Telegram
 * user may change it, whatever its source, so nobody can swap a picture right before the owner publishes.
 */
export function canChangeBrandPictures(brand: { ownerTelegramId: number | null }, userId: number | null): boolean {
  return brand.ownerTelegramId == null || (userId != null && userId === brand.ownerTelegramId);
}
