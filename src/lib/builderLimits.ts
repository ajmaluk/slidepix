export function getBuilderUsage(userId: string): number {
  const today = new Date().toISOString().split("T")[0];
  const key = `dalam_builder_usage_${userId}_${today}`;
  const value = localStorage.getItem(key);
  return value ? parseInt(value, 10) : 0;
}

export function incrementBuilderUsage(userId: string): number {
  const today = new Date().toISOString().split("T")[0];
  const key = `dalam_builder_usage_${userId}_${today}`;
  const current = getBuilderUsage(userId);
  const next = current + 1;
  localStorage.setItem(key, next.toString());
  
  // Dispatch an event so the sidebar can update immediately
  window.dispatchEvent(new CustomEvent("dalam_builder_usage_updated", { detail: { userId, usage: next } }));
  return next;
}
