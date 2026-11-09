export function isCalendarDate(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

export function isUtcTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(value);
  if (!match || !isCalendarDate(match[1])) return false;
  return Number(match[2]) <= 23
    && Number(match[3]) <= 59
    && Number(match[4]) <= 59
    && new Date(value).toISOString() === value;
}

export function isJsonCompatibleProvenance(value, active = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") {
    return Number.isFinite(value) && !Object.is(value, -0)
      && (!Number.isInteger(value) || Number.isSafeInteger(value));
  }
  if (typeof value !== "object" || active.has(value)) return false;
  active.add(value);
  try {
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
    const keys = Reflect.ownKeys(value);
    const length = array ? Object.getOwnPropertyDescriptor(value, "length")?.value : 0;
    if (array && (!Number.isSafeInteger(length) || keys.length !== length + 1)) return false;
    for (const key of keys) {
      if (array && key === "length") continue;
      if (typeof key !== "string" || (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length))) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)
        || !isJsonCompatibleProvenance(descriptor.value, active)) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    active.delete(value);
  }
}
