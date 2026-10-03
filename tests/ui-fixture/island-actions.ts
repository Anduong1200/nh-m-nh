// Production actions cannot execute in this isolated browser fixture.
export async function readIslandStateAction() { throw new Error("Inject Island fixture transport"); }
export async function listGameSessionsAction() { throw new Error("Inject Island fixture transport"); }
export async function readIslandJournalAction() { throw new Error("Inject Island journal fixture transport"); }
export async function readIslandEntryAction() { throw new Error("Inject Island journal fixture transport"); }
export async function applyIslandEntryAction() { throw new Error("Inject Island journal fixture transport"); }
