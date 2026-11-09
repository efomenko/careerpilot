import { createCareerState } from "./career-state.js";
import { createCareerStorage } from "./career-storage.js";

const loadStatuses = new Set([
  "missing",
  "loaded",
  "protected",
  "corrupt",
  "unsupported-version",
  "unavailable"
]);

const saveStatuses = new Set([
  "saved",
  "writes-disabled",
  "invalid-snapshot",
  "json-fidelity-error",
  "write-failed"
]);

function copyWarning(warning) {
  return warning ? { kind: warning.kind, message: warning.message } : null;
}

function copyStatus(status) {
  return {
    persistentWarning: copyWarning(status.persistentWarning),
    transientWarning: copyWarning(status.transientWarning)
  };
}

function sameWarning(left, right) {
  return left === right
    || (left !== null && right !== null
      && left.kind === right.kind
      && left.message === right.message);
}

function sameStatus(left, right) {
  return sameWarning(left.persistentWarning, right.persistentWarning)
    && sameWarning(left.transientWarning, right.transientWarning);
}

function messageForSaveStatus(status) {
  switch (status) {
    case "invalid-snapshot":
      return "This change is available in this session but could not be saved because the data is invalid.";
    case "json-fidelity-error":
      return "This change is available in this session but could not be saved without changing its data.";
    case "write-failed":
      return "This change is available in this session but could not be saved.";
    case "writes-disabled":
      return "Saving is disabled. Changes are available only in this session.";
    default:
      return "The change is available in this session but could not be saved.";
  }
}

const mutationMethods = new Set([
  "createProfile", "updateProfile", "addEmploymentRecord", "updateEmploymentRecord",
  "deleteEmploymentRecord", "addAchievementRecord", "updateAchievementRecord",
  "updateAchievementVerificationStatus", "deleteAchievementRecord", "createJob",
  "updateJob", "archiveJob", "reactivateJob", "deleteJob", "createRequirement",
  "updateRequirement", "deleteRequirement", "createAchievementMapping", "deleteAchievementMapping",
  "restoreSnapshot"
]);

const trackedStates = new WeakSet();

function wrapMutationState(
  persistence,
  saveRestoredSnapshot,
  runTrackedMutation = (operation) => persistence.runMutation(operation)
) {
  if (trackedStates.has(persistence.state)) {
    return persistence.state;
  }
  const state = new Proxy(persistence.state, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (!mutationMethods.has(property)) {
        return value;
      }
      return (...args) => runTrackedMutation(() => {
        const result = value.apply(target, args);
        if (property === "restoreSnapshot" && saveRestoredSnapshot) {
          saveRestoredSnapshot();
        }
        return result;
      });
    }
  });
  trackedStates.add(state);
  return state;
}

export function createPersistenceMutationState(persistence) {
  return wrapMutationState(persistence);
}

export function createPersistenceNotifications(notifications, persistence) {
  return {
    ...notifications,
    show(type, message) {
      if (type === "success") {
        const outcome = persistence.getMutationSaveOutcome();
        if (outcome === "unchanged") {
          return;
        }
        if (outcome !== "saved") {
          notifications.show("error", "Saving could not be completed. Check the persistence status before retrying.");
          return;
        }
      }
      notifications.show(type, message);
    }
  };
}

/**
 * Coordinates storage loading, state hydration, and post-mutation saves.
 *
 * The optional third argument replaces the storage/state factories for
 * deterministic failure-path testing; applications should omit it.
 */
export function createCareerPersistence(
  storage,
  { onStatusChange, onUnexpectedError } = {},
  {
    createStorage = createCareerStorage,
    createState = createCareerState
  } = {}
) {
  if (onStatusChange !== undefined && typeof onStatusChange !== "function") {
    throw new TypeError("onStatusChange must be a function.");
  }
  if (onUnexpectedError !== undefined && typeof onUnexpectedError !== "function") {
    throw new TypeError("onUnexpectedError must be a function.");
  }
  if (typeof createStorage !== "function" || typeof createState !== "function") {
    throw new TypeError("Persistence factories must be functions.");
  }

  const status = {
    persistentWarning: null,
    transientWarning: null
  };
  let mutationSaveOutcome = null;
  let activeMutation = null;

  function recordMutationOutcome(outcome) {
    mutationSaveOutcome = outcome;
    // Explicit wrappers summarize attempts, while tracked mutations retain their own attempt.
    for (let frame = activeMutation; frame; frame = frame.parent) {
      if (frame === activeMutation || frame.aggregate) {
        frame.outcome = outcome;
      }
    }
  }

  function reportUnexpected(error) {
    if (onUnexpectedError) {
      try {
        onUnexpectedError(error);
        return;
      } catch (handlerError) {
        try {
          console.error("Career persistence error handler failed.", handlerError, error);
        } catch {
          return;
        }
        return;
      }
    }

    try {
      console.error("Career persistence operation failed.", error);
    } catch {
      return;
    }
  }

  function emitStatus() {
    if (!onStatusChange) {
      return;
    }

    try {
      onStatusChange(copyStatus(status));
    } catch (error) {
      reportUnexpected(error);
    }
  }

  function updateStatus(next) {
    const updated = {
      persistentWarning: next.persistentWarning === undefined
        ? status.persistentWarning
        : next.persistentWarning,
      transientWarning: next.transientWarning === undefined
        ? status.transientWarning
        : next.transientWarning
    };

    if (sameStatus(status, updated)) {
      return;
    }

    status.persistentWarning = copyWarning(updated.persistentWarning);
    status.transientWarning = copyWarning(updated.transientWarning);
    emitStatus();
  }

  function setUnexpectedWarning(error) {
    recordMutationOutcome("unexpected-error");
    updateStatus({
      transientWarning: {
        kind: "unexpected-error",
        message: "A change is available in this session but could not be saved."
      }
    });
    reportUnexpected(error);
  }

  let adapter = null;
  let adapterUnavailable = false;

  try {
    adapter = createStorage(storage);
  } catch (error) {
    adapterUnavailable = true;
    reportUnexpected(error);
    updateStatus({
      persistentWarning: {
        kind: "unavailable",
        message: "Storage is unavailable. Changes will remain only in this session."
      }
    });
  }

  let loadResult = null;
  if (adapter) {
    try {
      loadResult = adapter.load();
      if (!loadResult || !loadStatuses.has(loadResult.status)) {
        throw new Error("Storage returned an unknown load result.");
      }
    } catch (error) {
      adapterUnavailable = true;
      reportUnexpected(error);
      updateStatus({
        persistentWarning: {
          kind: "unavailable",
          message: "Stored data could not be loaded. Changes will remain only in this session."
        }
      });
    }
  }

  function saveAfterMutation(snapshotAccessor) {
    if (adapterUnavailable || !adapter) {
      recordMutationOutcome("unavailable");
      return;
    }

    try {
      const snapshot = snapshotAccessor();
      const result = adapter.save(snapshot);
      if (!result || !saveStatuses.has(result.status)) {
        throw new Error("Storage returned an unknown save result.");
      }
      recordMutationOutcome(result.status);
      switch (result.status) {
        case "saved":
          updateStatus({
            persistentWarning: status.persistentWarning?.kind === "unavailable"
              ? null
              : status.persistentWarning,
            transientWarning: null
          });
          break;
        case "writes-disabled":
          updateStatus({
            persistentWarning: status.persistentWarning
              && status.persistentWarning.kind !== "unavailable"
              ? status.persistentWarning
              : {
                kind: "read-only",
                message: "Saving is disabled because stored data could not be safely replaced."
              },
            transientWarning: {
              kind: "write-disabled",
              message: messageForSaveStatus(result.status)
            }
          });
          break;
        case "invalid-snapshot":
        case "json-fidelity-error":
        case "write-failed":
          updateStatus({
            transientWarning: {
              kind: result.status,
              message: messageForSaveStatus(result.status)
            }
          });
          break;
        default:
          throw new Error(`Unhandled storage save result: ${result.status}`);
      }
    } catch (error) {
      setUnexpectedWarning(error);
    }
  }

  function createStateInstance() {
    return createState({
      onMutation: saveAfterMutation,
      onMutationError: setUnexpectedWarning
    });
  }

  let state = createStateInstance();

  if (loadResult) {
    switch (loadResult.status) {
      case "missing":
        break;
      case "loaded":
        if (loadResult.writesDisabled) {
          updateStatus({
            persistentWarning: {
              kind: "read-only",
              message: "Existing data remains available, but changes cannot be saved because the stored data cannot be safely rewritten."
            }
          });
        }
        break;
      case "protected":
        updateStatus({
          persistentWarning: {
            kind: "read-only",
            message: "Stored data contains numbers that cannot be read without loss. It has not been loaded or replaced, and changes cannot be saved."
          }
        });
        break;
      case "corrupt":
        updateStatus({
          persistentWarning: {
            kind: "corrupt",
            message: "Stored data is corrupt and was not replaced. Changes will remain only in this session."
          }
        });
        break;
      case "unsupported-version":
        updateStatus({
          persistentWarning: {
            kind: "unsupported-version",
            message: "Stored data uses an unsupported version and was not replaced."
          }
        });
        break;
      case "unavailable":
        // An unread snapshot cannot safely be replaced by this in-memory state.
        // Recovery requires a new initialization; this session remains read-only.
        adapterUnavailable = true;
        updateStatus({
          persistentWarning: {
            kind: "unavailable",
            message: "Stored data could not be read. Saving is disabled for this session; changes remain only in memory. Reload when storage is available to recover existing data."
          }
        });
        break;
      default:
        break;
    }

    if (loadResult.status === "loaded") {
      try {
        state.restoreSnapshot(loadResult.snapshot);
      } catch (error) {
        adapterUnavailable = true;
        reportUnexpected(error);
        updateStatus({
          persistentWarning: {
            kind: "unavailable",
            message: "Stored data could not be restored. Changes will remain only in this session."
          }
        });
        state = createStateInstance();
      }
    }
  }

  function runMutation(operation, aggregate) {
    const current = { outcome: null, parent: activeMutation, aggregate };
    activeMutation = current;
    mutationSaveOutcome = null;
    try {
      const result = operation();
      if (current.outcome === null) {
        current.outcome = "unchanged";
      }
      return result;
    } finally {
      activeMutation = current.parent;
      mutationSaveOutcome = current.outcome;
    }
  }

  const persistence = {
    state,
    runMutation(operation) {
      return runMutation(operation, true);
    },
    getMutationSaveOutcome() {
      return mutationSaveOutcome;
    },
    getStatus() {
      return copyStatus(status);
    }
  };
  persistence.state = wrapMutationState(
    persistence,
    () => saveAfterMutation(() => state.getSnapshot()),
    (operation) => runMutation(operation, false)
  );
  return persistence;
}
