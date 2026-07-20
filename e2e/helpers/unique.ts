/** Unique suffix so e2e runs do not collide with seed or prior runs. */
export function uniqueId(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function uniqueEmail(prefix = "e2e") {
  return `${uniqueId(prefix)}@acme.local`.toLowerCase();
}
