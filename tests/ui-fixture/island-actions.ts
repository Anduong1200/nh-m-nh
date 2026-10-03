// Production actions cannot execute in this isolated browser fixture.
export async function readIslandStateAction() { throw new Error("Inject Island fixture transport"); }
export async function listGameSessionsAction() { throw new Error("Inject Island fixture transport"); }
