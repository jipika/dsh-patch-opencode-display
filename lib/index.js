// dsh-patch-opencode-display — host half: no-op, only to mount client bundle
export const name = "dsh-patch-opencode-display";
export const inject = [];
export function apply() {
  console.log("[dsh-patch-opencode-display] host half mounted");
}
