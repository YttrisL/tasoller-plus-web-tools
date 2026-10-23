// ------------------------------------------------------------------------------------------------
// Known firmware packages. The Flasher computes the SHA-256 of the .skystar file you choose and looks it up here.
// To recognise another package, add a line: its SHA-256 (64 lower case hex digits, for example from
// `Get-FileHash file.skystar` in PowerShell), a name, and official: true only for the vendor's own files, or supernova: true for a release of the
// Supernova custom firmware (its file name is the name, and every new build of the firmware has a new hash to add here). The Supernova lines are the
// history of the releases, the NEWEST FIRST: the first one is the latest and the Flasher warns about flashing any other. A line can have a label, shown
// as what the package is. NEVER replace or remove a line of a release: add the new one at the top, the old ones are what makes the Flasher warn that a
// package is outdated.
// A package that is not listed is still accepted when it passes the format checks, it just is not named.
// ------------------------------------------------------------------------------------------------
const KNOWN_PACKAGES = [
  { sha256: "e48e9fc929a9b4701f7492dbcc33fcedcd59800a7d7421fb013e3a8beb48e8ba", name: "TSLP_Main_APP_050_20250102.skystar", official: true },
  { sha256: "a5114a5d66f7f0b9bbee87c404edb4e80b400f16ee337c0becc13604d8dc7635", name: "SS321_CFW_SNV_20261024.skystar", official: false, supernova: true },
  { sha256: "fa09a0f70acee437409259cc90f343bfb54d6af50f22ac8d1537657e8c815d80", name: "SS321_CFW_SNV_20261022.skystar", official: false, supernova: true },
  { sha256: "b6c26f85686b2c0eb663ff35b25f98568326e0c79cf5b00442e1eb08b67ccc25", name: "SS321_CFW_SNV_20261022.skystar", official: false, supernova: true },
  { sha256: "10464fbf15261a1073a393462563656f5226e2ebf0432e92a4feb7d6eba37ec4", name: "SS321_CFW_SNV_20261022.skystar", official: false, supernova: true },
  { sha256: "2a39d910421f338d5c816b5b3e8bd61321491b9553fad61d93ccab2ac50d7c40", name: "dump-tool-tasoller-plus.skystar (flash dump firmware)", official: false, label: "Memory Dump Tool" },
];

// Is this package a Supernova release that is not the latest one?
function isOldSupernova(known) {
  const releases = KNOWN_PACKAGES.filter(k => k.supernova);
  return !!(known && known.supernova && releases.length && releases[0] !== known);
}

function findKnownPackage(sha256) {
  const h = String(sha256 || "").toLowerCase();
  return KNOWN_PACKAGES.find(k => k.sha256 === h) || null;
}

