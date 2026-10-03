import type { LetterCommand, RevealCommand } from "../../src/modules/letters/model";
const actor = new URLSearchParams(location.search).get("actor") ?? "0";
const url = (name: string) => `/api/letters/${name}?actor=${actor}`;
const post = async (name: string, command: unknown) => (await fetch(url(name), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) })).json();
export async function readLetterAction(id: string) { return (await fetch(url("read") + "&id=" + encodeURIComponent(id))).json(); }
export async function applyLetterCommandAction(command: LetterCommand) { return post("apply", command); }
export async function applyLetterRevealAction(command: RevealCommand) { return post("reveal", command); }
export async function listLettersAction() { return (await fetch(url("list"))).json(); }
