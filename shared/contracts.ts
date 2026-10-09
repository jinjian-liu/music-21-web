export type ParseStatus =
  "uploading" | "queued" | "processing" | "ready" | "failed";
export type PublicationStatus =
  "private" | "pending_review" | "published" | "rejected" | "removed";
export interface Account {
  id: string;
  email: string;
  displayName: string;
  role: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface PieceSummary {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  originalName: string;
  parseStatus: ParseStatus;
  publicationStatus: PublicationStatus;
  durationSeconds: number | null;
  trackCount: number | null;
  inferredKey: string | null;
  createdAt: string;
  parseError?: string | null;
  rightsSource?: string;
  rightsConfirmed?: boolean;
  reviewReason?: string | null;
}
export interface PracticeSession {
  id: string;
  pieceId: string;
  title: string;
  mode: "practice" | "single-note" | "step";
  targetTrackId: string | null;
  startedAt: string;
  endedAt: string;
  activeMs: number;
  matched: number | null;
  attempted: number | null;
}
export interface AudioPreferences {
  volume: number;
  resonance: number;
  tone: "grand" | "bright" | "mellow" | "electric";
}
export const defaultAudio: AudioPreferences = {
  volume: 72,
  resonance: 34,
  tone: "grand",
};
export const parseLabels: Record<ParseStatus, string> = {
  uploading: "待上传",
  queued: "等待解析",
  processing: "解析中",
  ready: "可练习",
  failed: "解析失败",
};
export const publicationLabels: Record<PublicationStatus, string> = {
  private: "私人曲目",
  pending_review: "审核中",
  published: "已公开",
  rejected: "已驳回",
  removed: "已下架",
};
