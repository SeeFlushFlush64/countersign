// The sender's own login or the designated countersigner may manage an
// agreement: send it, reissue its link, void it, see its signing link in the
// outbox and retry its deliveries.
export function canManage(
  user: { id: string; senderId: string } | null,
  document: { senderId: string; countersignerId: string | null },
): user is { id: string; senderId: string } {
  return Boolean(user && (user.senderId === document.senderId || user.id === document.countersignerId));
}
