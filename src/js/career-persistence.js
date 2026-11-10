import { createCareerState } from "./career-state.js";
import { createCareerStorage } from "./career-storage.js";
import { createSnapshotWriter } from "./snapshot-writer.js";
import { validateApprovalReceipt } from "./approval-receipt.js";
import { findCompletedImport, prepareApprovedImport } from "./approved-import.js";

const mutationMethods = new Set([
  "createProfile", "updateProfile", "addEmploymentRecord", "updateEmploymentRecord",
  "deleteEmploymentRecord", "addAchievementRecord", "updateAchievementRecord",
  "updateAchievementVerificationStatus", "deleteAchievementRecord", "createJob",
  "updateJob", "archiveJob", "reactivateJob", "deleteJob", "createRequirement",
  "updateRequirement", "deleteRequirement", "createAchievementMapping", "deleteAchievementMapping",
  "restoreSnapshot", "createImportSession", "transitionImportSession", "retryImportSession",
  "addImportCandidates", "setImportCategory", "updateImportCandidate", "decideImportCandidate"
]);

const careerFields = ["profile", "employmentRecords", "achievementRecords", "educationRecords", "certificationRecords"];

function careerData(snapshot) {
  return Object.fromEntries(careerFields.map((key) => [key, snapshot[key]]));
}

function copySnapshot(snapshot) {
  const state = createCareerState();
  state.restoreSnapshot(snapshot);
  return state.getSnapshot();
}

function updateApprovalReceipts(snapshot, method, args, session, careerRevision) {
  if (method !== "decideImportCandidate" && method !== "updateImportCandidate") return;
  const sessionId = args[0];
  const candidateId = method === "decideImportCandidate" ? args[1].candidateId : args[1];
  snapshot.import.approvalReceipts = snapshot.import.approvalReceipts.filter(
    (receipt) => receipt.sessionId !== sessionId || receipt.candidateId !== candidateId
  );
  if (method !== "decideImportCandidate" || args[1].action === "skip") return;

  const decision = session.reviewDecisions.find((item) => item.candidateId === candidateId);
  const candidate = session.candidates.find((item) => item.id === candidateId);
  const { category, reviewedData, validation, fieldProvenance } = candidate;
  let target = null;
  if (decision.action === "merge") {
    const targetCategory = category === "skill" ? "profile" : category;
    const collections = {
      employment: snapshot.employmentRecords,
      achievement: snapshot.achievementRecords,
      education: snapshot.educationRecords,
      certification: snapshot.certificationRecords
    };
    const matches = targetCategory === "profile"
      ? [snapshot.profile].filter((record) => record?.id === decision.targetRecordId)
      : collections[targetCategory].filter((record) => record.id === decision.targetRecordId);
    if (matches.length !== 1) throw new Error("Merge target is missing or ambiguous.");
    target = { category: targetCategory, id: decision.targetRecordId, record: matches[0] };
  }
  const receipt = {
    sessionId, candidateId, reviewed: { category, reviewedData, validation, fieldProvenance },
    decision, acknowledgedWarnings: args[3]?.acknowledgeWarnings === undefined
      ? false : args[3].acknowledgeWarnings,
    careerRevision, approvedAt: args[2], expiresAt: session.expiresAt, target
  };
  if (!validateApprovalReceipt(receipt)) throw new Error("Approval receipt is invalid.");
  snapshot.import.approvalReceipts.push(receipt);
}

export function createPersistenceMutationState(persistence) {
  return persistence.state;
}

export function createPersistenceNotifications(notifications, persistence) {
  return {
    ...notifications,
    async show(type, message, operation) {
      if (type === "success") {
        const outcome = await persistence.getOperationOutcome(operation);
        if (outcome === "unchanged") return;
        if (outcome !== "saved") {
          notifications.show("error", "Saving could not be completed. Check the persistence status before retrying.");
          return;
        }
      }
      notifications.show(type, message);
    }
  };
}

export function createCareerPersistence(
  storage,
  { onStatusChange, onUnexpectedError, locks = globalThis.navigator?.locks,
    secureContext = globalThis.isSecureContext === true } = {},
  { createStorage = createCareerStorage, createState = createCareerState } = {}
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
  function reportUnexpected(error) {
    if (onUnexpectedError) {
      try {
        onUnexpectedError(error);
        return;
      } catch (handlerError) {
        console.error("Career persistence error handler failed.", handlerError);
        return;
      }
    }
    console.error("Career persistence operation failed.", error);
  }
  let adapter;
  let initial;
  try {
    adapter = createStorage(storage);
    initial = adapter.load();
    if (!initial || !["missing", "loaded", "protected", "corrupt", "unsupported-version", "unavailable"].includes(initial.status)) {
      throw new Error("Storage returned an unknown load result.");
    }
  } catch (error) {
    reportUnexpected(error);
    initial = { status: "unavailable" };
  }
  let state = createState({});
  let status = { persistentWarning: null, transientWarning: null };
  if (initial.status === "loaded") {
    try {
      state.restoreSnapshot(initial.snapshot);
    } catch (error) {
      reportUnexpected(error);
      state = createState({});
      status.persistentWarning = { kind: "unavailable", message: "Stored data could not be restored. Saving is disabled." };
    }
  } else if (initial.status !== "missing") {
    const warnings = {
      protected: { kind: "read-only", message: "Stored data contains numbers that cannot be read without loss. It has not been loaded or replaced, and changes cannot be saved." },
      corrupt: { kind: "corrupt", message: "Stored data is corrupt and was not replaced. Saving is disabled." },
      "unsupported-version": { kind: "unsupported-version", message: "Stored data uses an unsupported version and was not replaced." },
      unavailable: { kind: "unavailable", message: "Stored data could not be read. Saving is disabled for this session; reload when storage is available." }
    };
    status.persistentWarning = warnings[initial.status];
  }
  if (initial.writesDisabled && !status.persistentWarning) {
    status.persistentWarning = { kind: "read-only", message: "Stored data remains available in this session but cannot be saved safely." };
  }
  const writerOptions = {
    locks,
    secureContext,
    initialSnapshot: state.getSnapshot(),
    initialSnapshotRevision: initial.snapshotRevision ?? 0,
    initialCareerRevision: initial.careerRevision ?? 0,
    copySnapshot,
    careerData
  };
  const writer = adapter && typeof adapter.createWriter === "function"
    ? adapter.createWriter(writerOptions)
    : createSnapshotWriter({
      ...writerOptions,
      storage: {
        load: () => ({ status: "unavailable" }),
        save: () => ({ status: "writes-disabled" })
      }
    });
  const operationOutcomes = new WeakMap();
  function notifyStatus() {
    if (!onStatusChange) return;
    try {
      onStatusChange({
        persistentWarning: status.persistentWarning && { ...status.persistentWarning },
        transientWarning: status.transientWarning && { ...status.transientWarning }
      });
    } catch (error) {
      reportUnexpected(error);
    }
  }
  const getCurrentState = () => {
    const current = createState({});
    current.restoreSnapshot(writer.getSnapshot());
    return current;
  };
  async function mutate(method, args) {
    if (status.persistentWarning) {
      const error = new Error(status.persistentWarning.message);
      error.status = "writes-disabled";
      if (status.transientWarning?.kind !== "write-disabled") {
        status = {
          ...status,
          transientWarning: {
            kind: "write-disabled",
            message: "Saving is disabled. The change was not applied."
          }
        };
        notifyStatus();
      }
      throw error;
    }
    let result;
    let stagingSnapshotFailed = false;
    try {
      result = await writer.write(writer.getRevisions().snapshotRevision, (snapshot) => {
        const staged = createState({});
        let value;
        if (method === "restoreSnapshot") staged.restoreSnapshot(args[0]);
        else {
          staged.restoreSnapshot(snapshot);
          value = staged[method](...args);
        }
        let next;
        try {
          next = staged.getSnapshot();
        } catch (error) {
          stagingSnapshotFailed = true;
          throw error;
        }
        updateApprovalReceipts(next, method, args, value, writer.getRevisions().careerRevision);
        return { snapshot: next, result: value };
      });
    } catch (error) {
      if (stagingSnapshotFailed) {
        reportUnexpected(error);
        status = { ...status, transientWarning: { kind: "unexpected-error", message: "The change could not be prepared for saving." } };
        notifyStatus();
      }
      throw error;
    }
    if (result.status !== "saved" && result.status !== "unchanged") {
      if (result.error) reportUnexpected(result.error);
      const error = new Error(`The change could not be saved (${result.status}).`);
      error.status = result.status;
      error.cause = result.cause;
      const failureKind = result.status === "save-failed" ? result.cause : result.status;
      const warningKind = failureKind === "writes-disabled" ? "write-disabled" : failureKind;
      if (status.transientWarning?.kind !== warningKind || status.transientWarning?.message !== error.message) {
        status = { ...status, transientWarning: { kind: warningKind, message: error.message } };
        notifyStatus();
      }
      throw error;
    }
    if (result.status === "saved" && status.transientWarning) {
      status = { ...status, transientWarning: null };
      notifyStatus();
    }
    return { value: result.result, outcome: result.status };
  }
  function startMutation(method, args) {
    const completion = mutate(method, args);
    const operation = completion.then(({ value }) => value);
    operationOutcomes.set(operation, completion.then(
      ({ outcome }) => outcome,
      (error) => error?.status ?? "error"
    ));
    return operation;
  }
  const publicState = new Proxy({}, {
    get(target, property) {
      if (mutationMethods.has(property)) return (...args) => startMutation(property, args);
      const current = getCurrentState();
      const value = current[property];
      return typeof value === "function" ? value.bind(current) : value;
    }
  });
  async function commitApprovedImport({ sessionId, expectedSnapshotRevision, expectedCareerRevision }, { createId, now }) {
    if (typeof sessionId !== "string" || !sessionId.trim()
      || !Number.isSafeInteger(expectedSnapshotRevision) || expectedSnapshotRevision < 0
      || !Number.isSafeInteger(expectedCareerRevision) || expectedCareerRevision < 0
      || typeof createId !== "function" || typeof now !== "function") {
      throw new TypeError("Import requires a session ID, revisions, ID generator and clock.");
    }
    if (status.persistentWarning) return { sessionId, status: "failed", reason: "writes-disabled" };
    try {
      const result = await writer.write(expectedSnapshotRevision, (snapshot) =>
        prepareApprovedImport(snapshot, {
          sessionId, expectedCareerRevision, careerRevision: writer.getRevisions().careerRevision, now, createId
        }), { findCompleted: (snapshot) => findCompletedImport(snapshot, sessionId) });
      if (result.status === "saved" || result.status === "unchanged") return result.result;
      if (result.error) reportUnexpected(result.error);
      return { sessionId, status: "failed", reason: result.status, ...(result.cause ? { cause: result.cause } : {}),
        ...(result.status === "stale" ? { expectedSnapshotRevision, actualSnapshotRevision: result.snapshotRevision } : {}) };
    } catch (error) {
      if (!error.code) {
        reportUnexpected(error);
        return { sessionId, status: "failed", reason: "invalid-data" };
      }
      return { sessionId, status: "failed", reason: error.code, ...error.details };
    }
  }
  return {
    state: publicState,
    commitApprovedImport,
    getRevisions: () => writer.getRevisions(),
    getOperationOutcome(operation) {
      return operationOutcomes.get(operation) ?? Promise.resolve("invalid-operation");
    },
    getStatus: () => ({
      persistentWarning: status.persistentWarning && { ...status.persistentWarning },
      transientWarning: status.transientWarning && { ...status.transientWarning }
    })
  };
}
