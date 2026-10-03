const messages: Record<string, string> = {
  AUTH_REQUIRED: "请先登录账号",
  INVALID_CREDENTIALS: "邮箱或密码不正确",
  ADMIN_REQUIRED: "需要管理员权限",
  NOT_FOUND: "曲目不存在或已下架",
  SERVICE_UNAVAILABLE: "云端暂时无法连接，本机曲目仍可使用",
  INVALID_STATE: "当前状态不支持此操作，请刷新后重试",
  NOT_READY: "曲目尚未完成解析，请稍后在曲库重试",
  RIGHTS_REQUIRED: "请补全有效的公开授权信息",
  CONFLICT: "该数据已存在，请检查后重试",
  VALIDATION_ERROR: "请检查填写的内容",
  RATE_LIMIT: "操作较频繁，请稍后重试",
  UPLOAD_LIMIT: "今天的上传次数已用完",
  REASON_REQUIRED: "请填写至少三个字的原因",
  DELETED: "云端曲目已删除，请重新保存",
};
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(messages[code] || "操作失败，请稍后重试");
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("SERVICE_UNAVAILABLE", 503);
  }
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: "SERVICE_UNAVAILABLE" }));
    throw new ApiError(body.error || "SERVICE_UNAVAILABLE", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export const json = (value: unknown) => JSON.stringify(value);
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请重试";
