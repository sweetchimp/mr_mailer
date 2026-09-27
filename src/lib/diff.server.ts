import { diffChars } from "diff";

interface DiffResult {
  insertions: number;
  deletions: number;
  modifications: number;
}

export function computeReplyDiff(generated: string, final: string): DiffResult {
  if (!generated && !final) {
    return { insertions: 0, deletions: 0, modifications: 0 };
  }

  if (!generated) {
    return { insertions: final.length, deletions: 0, modifications: 0 };
  }

  if (!final) {
    return { insertions: 0, deletions: generated.length, modifications: 0 };
  }

  const changes = diffChars(generated, final);
  let insertions = 0;
  let deletions = 0;

  for (const part of changes) {
    if (part.added) {
      insertions += part.count ?? part.value.length;
    } else if (part.removed) {
      deletions += part.count ?? part.value.length;
    }
  }

  const modifications = Math.min(insertions, deletions);
  insertions -= modifications;
  deletions -= modifications;

  return { insertions, deletions, modifications };
}
