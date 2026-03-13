import { useReducer, type ReactNode } from "react";
import {
  TasksContext,
  tasksReducer,
  INITIAL_TASKS_STATE,
} from "./tasksStore";

interface TasksProviderProps {
  children: ReactNode;
}

/**
 * Top-level provider that manages task/job state and exposes
 * the tasks context to the component tree.
 *
 * Event subscriptions and history loading are handled by consumers
 * (e.g., the Tasks page or a dedicated init hook) rather than here,
 * keeping the provider thin and testable.
 */
export function TasksProvider({ children }: TasksProviderProps) {
  const [state, dispatch] = useReducer(tasksReducer, INITIAL_TASKS_STATE);

  return (
    <TasksContext value={{ state, dispatch }}>
      {children}
    </TasksContext>
  );
}
