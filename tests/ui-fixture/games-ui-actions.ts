// Test-only action boundary. The browser fixture never imports Supabase/server auth.
export async function listGameSessionsAction(){throw new Error("Inject the Games fixture list transport");}
export async function readGameSessionAction(){throw new Error("Inject the Games fixture read transport");}
export async function applyGameCommandAction(){throw new Error("Inject the Games fixture command transport");}
