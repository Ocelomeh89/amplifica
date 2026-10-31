#!/usr/bin/env bash
# PreToolUse guard: any change to a file that holds the model's math stops for
# Miguel's explicit approval — through Edit/Write, or through a Bash command
# that writes to one (sed -i, a python rewrite, git checkout, ...). Tests are
# included: re-pinning a golden or invariant test is how a math change gets
# accepted.
MATH='src/shared/finance/|src/features/compare/engine/|src/features/dashboard/projection\.ts|src/features/simulator/useSimulation\.ts|src/features/simulator/sim-values\.ts'

input=$(cat)
tool=$(jq -r '.tool_name' <<<"$input")
target=""

if [ "$tool" = "Bash" ]; then
  cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
  if grep -Eq "$MATH" <<<"$cmd" &&
     grep -Eq "sed -i|python|perl|node -e|tee |>|cp |mv |rm |git (checkout|restore|revert|reset|apply|stash|cherry-pick|merge|pull)" <<<"$cmd"; then
    target=$(grep -Eo "($MATH)[^ \"']*" <<<"$cmd" | head -1)
  fi
else
  f=$(jq -r '.tool_input.file_path // empty' <<<"$input")
  if grep -Eq "$MATH" <<<"$f"; then target="${f#*/amplifica/}"; fi
fi

[ -z "$target" ] && exit 0

jq -n --arg f "$target" '{
  systemMessage: ("⚠️ MATH WARNING: this change touches " + $f + ", which can change the model'"'"'s numbers."),
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: ("⚠️ MATH WARNING — " + $f + " is part of the projection/compare math. Approve only if you intend the numbers to change."),
    additionalContext: ("MATH GUARD: " + $f + " can change the model'"'"'s math. Before proceeding, tell Miguel in plain words whether this change alters any number the engine produces, and which ones. Never make a math change he did not ask for.")
  }
}'
exit 0
