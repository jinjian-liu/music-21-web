import { transaction } from "../repository";
export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
export function assertTransition(
  action: string,
  piece: {
    parse_status: string;
    publication_status: string;
    rights_confirmed?: boolean;
    rights_source?: string;
    rights_expires_at?: Date | string | null;
  },
) {
  if (action === "submit") {
    if (
      piece.parse_status !== "ready" ||
      !["private", "rejected"].includes(piece.publication_status)
    )
      throw new DomainError("INVALID_STATE");
    if (
      !piece.rights_confirmed ||
      !piece.rights_source?.trim() ||
      (piece.rights_expires_at &&
        new Date(piece.rights_expires_at) <= new Date())
    )
      throw new DomainError("RIGHTS_REQUIRED");
  } else if (action === "approve" || action === "reject") {
    if (
      piece.publication_status !== "pending_review" ||
      piece.parse_status !== "ready"
    )
      throw new DomainError("INVALID_STATE");
    if (
      action === "approve" &&
      (!piece.rights_confirmed ||
        !piece.rights_source ||
        (piece.rights_expires_at &&
          new Date(piece.rights_expires_at) <= new Date()))
    )
      throw new DomainError("RIGHTS_REQUIRED");
  } else if (action === "remove" && piece.publication_status !== "published")
    throw new DomainError("INVALID_STATE");
}
export async function moderate(
  id: string,
  reviewer: string,
  action: string,
  reason?: string,
) {
  return transaction(async (tx) => {
    const piece = (
      await tx.query(
        "SELECT * FROM pieces WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!piece) throw new DomainError("NOT_FOUND", 404);
    assertTransition(action, piece);
    const status =
      action === "approve"
        ? "published"
        : action === "reject"
          ? "rejected"
          : "removed";
    await tx.query(
      "UPDATE pieces SET publication_status=$2,status=$2,review_reason=$3,updated_at=now() WHERE id=$1",
      [id, status, reason || null],
    );
    await tx.query(
      "INSERT INTO moderation_events(piece_id,reviewer_id,action,reason) VALUES($1,$2,$3,$4)",
      [id, reviewer, action, reason || null],
    );
    return { status, publicationStatus: status };
  });
}
