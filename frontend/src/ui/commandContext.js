export const CommandContextKey = Symbol("CommandContext");

export function mergeClass(baseClass, extraClass) {
  return [baseClass, extraClass].filter(Boolean).join(" ");
}

let __commandItemId = 0;
export function nextCommandItemId() {
  __commandItemId += 1;
  return `cmdk-item-${__commandItemId}`;
}
