// Test-only transport. Never import the server push dispatcher into browser fixtures.
export async function enrollPushAction() { return { error: "Thông báo nền chưa được cấu hình." }; }
export async function disablePushAction() { return { disabled: true }; }
export async function readPushSubscriptionAction() { return {}; }
