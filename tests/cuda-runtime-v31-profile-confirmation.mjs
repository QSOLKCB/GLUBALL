import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/physical-cuda-v31-architecture-ladder.yml", import.meta.url),
  "utf8",
);

assert.match(
  workflow,
  /target_profile:\r?\n[ \t]+description: "Physical GPU profile"\r?\n[ \t]+required: true\r?\n[ \t]+default: "a100"\r?\n[ \t]+type: choice/,
);

const confirmStart = workflow.indexOf("      confirm_target_profile:");
const confirmEnd = workflow.indexOf("      u_segments:", confirmStart);
assert.notEqual(confirmStart, -1, "confirm_target_profile input must exist");
assert.notEqual(confirmEnd, -1, "u_segments input must follow confirmation input");
const confirmBlock = workflow.slice(confirmStart, confirmEnd);
assert.match(
  confirmBlock,
  /confirm_target_profile:\r?\n[ \t]+description: "Type the selected physical GPU profile exactly to confirm"\r?\n[ \t]+required: true\r?\n[ \t]+type: string/,
);
assert.doesNotMatch(confirmBlock, /default:/);

assert.match(workflow, /PROFILE_CONFIRMATION: \$\{\{ inputs\.confirm_target_profile \}\}/);
assert.match(workflow, /- name: Require explicit profile confirmation/);
assert.match(workflow, /if \[ "\$PROFILE_CONFIRMATION" != "\$PROFILE" \]; then/);
assert.match(workflow, /target_profile must be explicitly confirmed/);
assert.ok(
  workflow.indexOf("- name: Require explicit profile confirmation") <
    workflow.indexOf("- name: Checkout exact workflow ref"),
  "profile confirmation must fail before checkout/evidence work",
);

assert.match(workflow, /- name: Define evidence receipt paths\r?\n[ \t]+id: receipt_paths/);
assert.match(workflow, /- name: Verify full-GPU and canonical-workload preflight\r?\n[ \t]+id: physical_preflight/);
assert.match(workflow, /- name: Verify frozen measured Runtime build inputs\r?\n[ \t]+id: frozen_build_inputs/);
assert.match(
  workflow,
  /Bind frozen measured build-input receipt[\s\S]*?if: always\(\) && steps\.receipt_paths\.outcome == 'success' && steps\.frozen_build_inputs\.outcome != 'skipped'/,
);
assert.match(
  workflow,
  /Bind physical preflight receipt[\s\S]*?if: always\(\) && steps\.receipt_paths\.outcome == 'success' && steps\.physical_preflight\.outcome != 'skipped'/,
);
assert.match(
  workflow,
  /Upload architecture evidence bundle[\s\S]*?if: always\(\) && steps\.receipt_paths\.outcome == 'success' && steps\.physical_preflight\.outcome != 'skipped'/,
);
assert.match(
  workflow,
  /Require final PASS[\s\S]*?if: always\(\) && steps\.campaign\.outcome != 'skipped'/,
);

console.log("GLUBALL Runtime V3.1 explicit profile confirmation: PASS");
