const LOCK_NAME = "careerpilot.snapshot";

function equalJson(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Object.hasOwn(right, key) && equalJson(left[key], right[key]));
}

/**
 * Coordinates snapshot writes for callers that supply a revisioned storage
 * adapter. The published value is owned by this writer and never exposed
 * without copying.
 */
export function createSnapshotWriter({
  storage,
  locks,
  secureContext,
  initialSnapshot,
  initialSnapshotRevision,
  initialCareerRevision,
  copySnapshot,
  careerData,
  validatePrepared
}) {
  if (!storage || typeof storage.load !== "function" || typeof storage.save !== "function") {
    throw new TypeError("Storage must provide load and save functions.");
  }
  if (typeof copySnapshot !== "function" || typeof careerData !== "function") {
    throw new TypeError("Snapshot copy and career data functions are required.");
  }
  if (![initialSnapshotRevision, initialCareerRevision].every(
    (revision) => Number.isSafeInteger(revision) && revision >= 0
  ) || initialCareerRevision > initialSnapshotRevision) {
    throw new TypeError("Initial revisions must be valid non-negative safe integers.");
  }

  let publishedSnapshot = copySnapshot(initialSnapshot);
  let publishedSnapshotRevision = initialSnapshotRevision;
  let publishedCareerRevision = initialCareerRevision;

  return {
    getSnapshot() {
      return copySnapshot(publishedSnapshot);
    },
    getRevisions() {
      return { snapshotRevision: publishedSnapshotRevision, careerRevision: publishedCareerRevision };
    },
    async write(expectedRevision, prepare) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new TypeError("Expected revision must be a non-negative safe integer.");
      }
      if (typeof prepare !== "function") {
        throw new TypeError("A preparation function is required.");
      }
      if (secureContext !== true || !locks || typeof locks.request !== "function") {
        return { status: "coordination-unavailable" };
      }

      let callbackStarted = false;
      try {
        return await locks.request(LOCK_NAME, { mode: "exclusive" }, async () => {
          callbackStarted = true;
          const current = await storage.load();
          if (!current || !["loaded", "missing"].includes(current.status)) {
            return { status: "read-failed", cause: current?.status ?? "invalid-result" };
          }
          if (current.writesDisabled) {
            return { status: "writes-disabled" };
          }
          if (![current.snapshotRevision, current.careerRevision].every(
            (revision) => Number.isSafeInteger(revision) && revision >= 0
          ) || current.careerRevision > current.snapshotRevision) {
            return { status: "read-failed", cause: "invalid-revision" };
          }
          if (current.snapshotRevision !== expectedRevision || publishedSnapshotRevision !== expectedRevision
            || current.careerRevision !== publishedCareerRevision) {
            return { status: "stale", snapshotRevision: current.snapshotRevision };
          }

          const prepared = await prepare(copySnapshot(current.snapshot));
          if (!prepared || !Object.hasOwn(prepared, "snapshot")) {
            throw new TypeError("Preparation must return a snapshot.");
          }
          if (validatePrepared) {
            const validation = validatePrepared(prepared.snapshot);
            if (validation.status !== "valid") {
              return { status: "save-failed", cause: validation.status, errors: validation.errors };
            }
          }
          const nextSnapshot = copySnapshot(prepared.snapshot);
          const careerChanged = !equalJson(careerData(current.snapshot), careerData(nextSnapshot));
          if (equalJson(current.snapshot, nextSnapshot) && !prepared.forceWrite) {
            return { status: "unchanged", result: prepared.result };
          }
          if (current.snapshotRevision === Number.MAX_SAFE_INTEGER
            || (careerChanged && current.careerRevision === Number.MAX_SAFE_INTEGER)) {
            return { status: "revision-exhausted" };
          }
          const writeSnapshot = copySnapshot(nextSnapshot);
          const revisions = {
            snapshotRevision: current.snapshotRevision + 1,
            careerRevision: current.careerRevision + (careerChanged ? 1 : 0)
          };
          let saved;
          try {
            saved = await storage.save(writeSnapshot, revisions);
          } catch (error) {
            return { status: "save-failed", cause: "unexpected-error", error };
          }
          if (!saved || saved.status !== "saved") {
            const failure = { status: "save-failed", cause: saved?.status ?? "invalid-result" };
            if (saved?.errors !== undefined) failure.errors = saved.errors;
            return failure;
          }

          publishedSnapshot = nextSnapshot;
          publishedSnapshotRevision = revisions.snapshotRevision;
          publishedCareerRevision = revisions.careerRevision;
          return { status: "saved", ...revisions, result: prepared.result };
        });
      } catch (error) {
        if (callbackStarted) throw error;
        return { status: "coordination-failed" };
      }
    }
  };
}
