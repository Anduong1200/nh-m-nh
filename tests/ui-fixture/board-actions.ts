// Test-only boundary. This module is used solely by the standalone Phase 2 fixture.
export async function appendBoardObjectAction() {
  throw new Error("Board mutations are outside the Phase 2 UI fixture.");
}
export async function updateBoardObjectAction() {
  throw new Error("Board mutations are outside the Phase 2 UI fixture.");
}
