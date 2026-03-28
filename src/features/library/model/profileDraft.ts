export function mergeProfileDraft(
  explicitOverrides: Record<string, unknown>,
  draft: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...explicitOverrides };

  for (const [key, value] of Object.entries(draft)) {
    if (value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

export function profileDraftIsDirty(
  explicitOverrides: Record<string, unknown>,
  draft: Record<string, unknown>,
): boolean {
  return !deepEqual(mergeProfileDraft(explicitOverrides, draft), explicitOverrides);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => deepEqual(value, right[index]));
  }

  if (
    left !== null &&
    right !== null &&
    typeof left === "object" &&
    typeof right === "object"
  ) {
    const leftEntries = Object.entries(left as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const rightEntries = Object.entries(right as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    if (leftEntries.length !== rightEntries.length) {
      return false;
    }

    return leftEntries.every(([leftKey, leftValue], index) => {
      const [rightKey, rightValue] = rightEntries[index] ?? [];
      return leftKey === rightKey && deepEqual(leftValue, rightValue);
    });
  }

  return false;
}
