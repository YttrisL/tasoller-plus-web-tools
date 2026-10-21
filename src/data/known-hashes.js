// ------------------------------------------------------------------------------------------------
// Known firmware packages. The Flasher computes the SHA-256 of the .skystar file you choose and looks it up here.
// To recognise another package, add a line: its SHA-256 (64 lower case hex digits, for example from
// `Get-FileHash file.skystar` in PowerShell), a name, and official: true only for the vendor's own files.
// A package that is not listed is still accepted when it passes the format checks, it just is not named.
// ------------------------------------------------------------------------------------------------
const KNOWN_PACKAGES = [
  { sha256: "e48e9fc929a9b4701f7492dbcc33fcedcd59800a7d7421fb013e3a8beb48e8ba", name: "TSLP_Main_APP_050_20250102.skystar", official: true },
  { sha256: "2a39d910421f338d5c816b5b3e8bd61321491b9553fad61d93ccab2ac50d7c40", name: "dump-tool-tasoller-plus.skystar (flash dump firmware)", official: false },
];

function findKnownPackage(sha256) {
  const h = String(sha256 || "").toLowerCase();
  return KNOWN_PACKAGES.find(k => k.sha256 === h) || null;
}

