// The web3-free half of the SDK: constants, the slot table and the grip maths.
// Import this from UI code that must stay light (the landing page, the mock driver).
// Import "@clawdrop/sdk" (the full SDK) only where a chain connection is needed.
export * from "./game";
export * from "./slots";
export * from "./grip";
