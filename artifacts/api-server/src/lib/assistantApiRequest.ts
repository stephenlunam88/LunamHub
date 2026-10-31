/** Correct the common shopping-item field name used by language models. */
export function normalizeAssistantApiRequest(
  method: string,
  path: string,
  body: Record<string, unknown> | undefined,
) {
  if (
    method === "POST" &&
    /^\/lists\/\d+\/items$/.test(path) &&
    body &&
    typeof body.name === "string" &&
    typeof body.text !== "string"
  ) {
    const { name, ...rest } = body;
    return { ...rest, text: name };
  }
  return body;
}

export function summarizeAssistantApiAction(
  method: string,
  path: string,
  body: Record<string, unknown> | undefined,
) {
  const normalizedBody = normalizeAssistantApiRequest(method, path, body);
  if (
    method === "POST" &&
    /^\/lists\/\d+\/items$/.test(path) &&
    typeof normalizedBody?.text === "string"
  ) {
    return `Add “${normalizedBody.text}” to the selected list`;
  }
  return undefined;
}
