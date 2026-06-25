import { createStoreContext, type StoreContextValue } from "../../shared/storeContext";
import type {
  BackupEntry,
  ConflictPlan,
  ExportPreflight,
  ExportResult,
  ImportApplyResult,
  ImportInspection,
  ImportWizardStep,
} from "../model/saveTypes";

export interface SavesState {
  activeGameId: string | null;
  exportPreflight: ExportPreflight | null;
  exportPreflightLoading: boolean;
  exportPending: boolean;
  lastExportResult: ExportResult | null;
  importInspection: ImportInspection | null;
  importInspectionLoading: boolean;
  importConflictPlan: ConflictPlan | null;
  importApplyPending: boolean;
  lastImportResult: ImportApplyResult | null;
  saveBackups: BackupEntry[];
  exportSelectedLabels: string[] | null;
  importArchivePath: string | null;
  importWizardStep: ImportWizardStep;
  backupFailureAccepted: boolean;
  backupFailureError: string | null;
  saveQuickActionsOpen: boolean;
}

export const INITIAL_SAVES_STATE: SavesState = {
  activeGameId: null,
  exportPreflight: null,
  exportPreflightLoading: false,
  exportPending: false,
  lastExportResult: null,
  importInspection: null,
  importInspectionLoading: false,
  importConflictPlan: null,
  importApplyPending: false,
  lastImportResult: null,
  saveBackups: [],
  exportSelectedLabels: null,
  importArchivePath: null,
  importWizardStep: "idle",
  backupFailureAccepted: false,
  backupFailureError: null,
  saveQuickActionsOpen: false,
};

export type SavesAction =
  | { type: "SET_ACTIVE_GAME"; gameId: string | null }
  | { type: "EXPORT_PREFLIGHT_LOADING" }
  | { type: "EXPORT_PREFLIGHT_LOADED"; preflight: ExportPreflight }
  | { type: "EXPORT_PREFLIGHT_ERROR" }
  | { type: "EXPORT_PENDING"; pending: boolean }
  | { type: "EXPORT_COMPLETE"; result: ExportResult }
  | { type: "IMPORT_INSPECTION_LOADING" }
  | { type: "IMPORT_INSPECTION_LOADED"; inspection: ImportInspection }
  | { type: "IMPORT_INSPECTION_ERROR" }
  | { type: "SET_IMPORT_CONFLICT_PLAN"; plan: ConflictPlan | null }
  | { type: "IMPORT_APPLY_PENDING"; pending: boolean }
  | { type: "IMPORT_APPLY_COMPLETE"; result: ImportApplyResult }
  | { type: "SAVE_BACKUPS_LOADED"; backups: BackupEntry[] }
  | { type: "SET_EXPORT_SELECTED_LABELS"; labels: string[] | null }
  | { type: "SET_IMPORT_ARCHIVE_PATH"; path: string | null }
  | { type: "SET_IMPORT_WIZARD_STEP"; step: ImportWizardStep }
  | { type: "SET_BACKUP_FAILURE"; error: string | null; accepted: boolean }
  | { type: "SET_SAVE_QUICK_ACTIONS_OPEN"; open: boolean }
  | { type: "CLEAR_SAVE_STATE" };

export function savesReducer(state: SavesState, action: SavesAction): SavesState {
  switch (action.type) {
    case "SET_ACTIVE_GAME":
      if (action.gameId === state.activeGameId) {
        return state;
      }
      return {
        ...state,
        activeGameId: action.gameId,
        exportPreflight: null,
        exportPreflightLoading: false,
        exportPending: false,
        lastExportResult: null,
        exportSelectedLabels: null,
        saveQuickActionsOpen: false,
      };
    case "EXPORT_PREFLIGHT_LOADING":
      return { ...state, exportPreflightLoading: true };
    case "EXPORT_PREFLIGHT_LOADED":
      return { ...state, exportPreflightLoading: false, exportPreflight: action.preflight };
    case "EXPORT_PREFLIGHT_ERROR":
      return { ...state, exportPreflightLoading: false };
    case "EXPORT_PENDING":
      return { ...state, exportPending: action.pending };
    case "EXPORT_COMPLETE":
      return { ...state, exportPending: false, lastExportResult: action.result };
    case "IMPORT_INSPECTION_LOADING":
      return { ...state, importInspectionLoading: true };
    case "IMPORT_INSPECTION_LOADED":
      return { ...state, importInspectionLoading: false, importInspection: action.inspection };
    case "IMPORT_INSPECTION_ERROR":
      return { ...state, importInspectionLoading: false };
    case "SET_IMPORT_CONFLICT_PLAN":
      return { ...state, importConflictPlan: action.plan };
    case "IMPORT_APPLY_PENDING":
      return { ...state, importApplyPending: action.pending };
    case "IMPORT_APPLY_COMPLETE":
      return { ...state, importApplyPending: false, lastImportResult: action.result };
    case "SAVE_BACKUPS_LOADED":
      return { ...state, saveBackups: action.backups };
    case "SET_EXPORT_SELECTED_LABELS":
      return { ...state, exportSelectedLabels: action.labels };
    case "SET_IMPORT_ARCHIVE_PATH":
      return { ...state, importArchivePath: action.path };
    case "SET_IMPORT_WIZARD_STEP":
      return { ...state, importWizardStep: action.step };
    case "SET_BACKUP_FAILURE":
      return {
        ...state,
        backupFailureError: action.error,
        backupFailureAccepted: action.accepted,
      };
    case "SET_SAVE_QUICK_ACTIONS_OPEN":
      return { ...state, saveQuickActionsOpen: action.open };
    case "CLEAR_SAVE_STATE":
      return {
        ...state,
        exportPreflight: null,
        exportPreflightLoading: false,
        exportPending: false,
        lastExportResult: null,
        importInspection: null,
        importInspectionLoading: false,
        importConflictPlan: null,
        importApplyPending: false,
        lastImportResult: null,
        exportSelectedLabels: null,
        importArchivePath: null,
        importWizardStep: "idle",
        backupFailureAccepted: false,
        backupFailureError: null,
        saveQuickActionsOpen: false,
      };
    default:
      return state;
  }
}

export type SavesContextValue = StoreContextValue<SavesState, SavesAction>;

const { Context: SavesContext, useStore: useSaves } =
  createStoreContext<SavesState, SavesAction>("Saves");

export { SavesContext, useSaves };
