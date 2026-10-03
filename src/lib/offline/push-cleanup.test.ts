import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(()=>({binding:vi.fn(),getSubscription:vi.fn(),unsubscribe:vi.fn(),postMessage:vi.fn()}));
vi.mock("@/modules/notifications/push-browser",()=>({setPushWorkerBinding:m.binding}));
import { disconnectLocalPush } from "./push-cleanup";
beforeEach(()=>{m.binding.mockResolvedValue(true);m.unsubscribe.mockResolvedValue(true);m.getSubscription.mockResolvedValue({unsubscribe:m.unsubscribe});vi.stubGlobal("navigator",{serviceWorker:{getRegistration:async()=>({active:{postMessage:m.postMessage},pushManager:{getSubscription:m.getSubscription}})}});});
afterEach(()=>vi.unstubAllGlobals());
it("fails closed when the worker cannot confirm clearing its binding",async()=>{m.binding.mockResolvedValue(false);await expect(disconnectLocalPush()).rejects.toThrow(/cleanup/);expect(m.unsubscribe).not.toHaveBeenCalled();});
it("does not claim cleanup if the browser remains subscribed",async()=>{await expect(disconnectLocalPush()).rejects.toThrow(/unsubscribe/);expect(m.unsubscribe).toHaveBeenCalledOnce();});
it("clears the binding before unsubscribing and confirms there is no subscription",async()=>{m.getSubscription.mockResolvedValueOnce({unsubscribe:m.unsubscribe}).mockResolvedValue(null);await expect(disconnectLocalPush()).resolves.toBeUndefined();expect(m.binding).toHaveBeenCalledWith(expect.anything(),null);expect(m.binding.mock.invocationCallOrder[0]).toBeLessThan(m.unsubscribe.mock.invocationCallOrder[0]!);});
