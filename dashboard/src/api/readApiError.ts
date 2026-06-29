interface ReferenceUsage {
  objectType?: unknown;
  objectId?: unknown;
  objectName?: unknown;
  field?: unknown;
}

function formatReferenceUsage(reference: ReferenceUsage) {
  const objectType = typeof reference.objectType === "string" ? reference.objectType : "Object";
  const objectName = typeof reference.objectName === "string" ? reference.objectName : undefined;
  const objectId = typeof reference.objectId === "string" ? reference.objectId : undefined;
  const field = typeof reference.field === "string" ? reference.field : undefined;
  const label = objectName ?? objectId ?? "Unknown";

  return `- ${objectType}: ${label}${field ? ` (${field})` : ""}`;
}

export async function readApiError(response: Response) {
  const body: unknown = await response.json().catch(() => null);

  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    (body as { error?: unknown }).error === "validation_error"
  ) {
    const message =
      "message" in body && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : "Delete blocked by validation.";
    const references =
      "references" in body && Array.isArray((body as { references?: unknown }).references)
        ? ((body as { references: ReferenceUsage[] }).references)
        : [];
    const referenceText = references.length > 0 ? `\n\nUsed by:\n${references.map(formatReferenceUsage).join("\n")}` : "";

    return `${message}${referenceText}`;
  }

  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }

  return `HTTP ${response.status}`;
}
