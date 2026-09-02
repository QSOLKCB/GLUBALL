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
assert.match(
  workflow,
  /confirm_target_profile:\r?\n[ \t]+description: "Type the selected physical GPU profile exactly to confirm"\r?\n[ \t]+required: true\r?\n[ \t]+default: "type-selected-profile"\r?\n[ \t]+type: string/,
);
assert.match(workflow, /PROFILE_CONFIRMATION: \$\{\{ inputs\.confirm_target_profile \}\}/);
assert.match(workflow, /- name: Require explicit profile confirmation/);
assert.match(workflow, /if \[ "\$PROFILE_CONFIRMATION" != "\$PROFILE" \]; then/);
assert.match(workflow, /target_profile must be explicitly confirmed/);
assert.ok(
  workflow.indexOf("- name: Require explicit profile confirmation") <
    workflow.indexOf("- name: Checkout exact workflow ref"),
  "profile confirmation must fail before checkout/evidence work",
);

console.log("GLUBALL Runtime V3.1 explicit profile confirmation: PASS");
