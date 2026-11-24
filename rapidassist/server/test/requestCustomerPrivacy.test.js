const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { attachCustomerForAssignedProvider, isAssignedProvider } = require("../src/utils/requestCustomer");

const id = (v) => ({ toString: () => v });
const provider = { _id: id("provider-1") };
const otherProvider = { _id: id("provider-2") };
const customer = { _id: id("customer-1") };
const assigned = { userId: id("customer-1"), providerId: id("provider-1") };
const openOffer = { userId: id("customer-1"), providerId: null };
const users = [{ _id: id("customer-1"), name: "Usman Ali", phone: "03001234567" }];

async function run(requests, user, role) {
  const lookups = [];
  const payloads = requests.map((_, i) => ({ id: `r${i}` }));
  const out = await attachCustomerForAssignedProvider(requests, payloads, user, role, async (ids) => { lookups.push(ids); return users; });
  return { out, lookups };
}

test("the assigned provider receives the customer's name and phone", async () => {
  const { out } = await run([assigned], provider, "mechanic");
  assert.deepEqual(out[0].customer, { id: "customer-1", name: "Usman Ali", phone: "03001234567" });
});

test("open offers never expose the customer, and no user lookup happens", async () => {
  const { out, lookups } = await run([openOffer], provider, "mechanic");
  assert.equal("customer" in out[0], false);
  assert.deepEqual(lookups, []);
});

test("other providers, the customer, admins and a provider account in customer mode get no customer field", async () => {
  for (const [user, role] of [[otherProvider, "mechanic"], [customer, "user"], [provider, "admin"], [provider, "user"], [null, "mechanic"]]) {
    const { out, lookups } = await run([assigned], user, role);
    assert.equal("customer" in out[0], false, `${role} ${user?._id}`);
    assert.deepEqual(lookups, []);
  }
});

test("only matching rows in a mixed list are enriched", async () => {
  const { out, lookups } = await run([assigned, openOffer, { ...assigned, providerId: id("provider-2") }], provider, "mechanic");
  assert.equal(out[0].customer.name, "Usman Ali");
  assert.equal("customer" in out[1], false);
  assert.equal("customer" in out[2], false);
  assert.deepEqual(lookups, [["customer-1"]]);
});

test("missing customer record yields null rather than another user's data", async () => {
  const out = await attachCustomerForAssignedProvider([{ ...assigned, userId: id("gone") }], [{}], provider, "mechanic", async () => users);
  assert.equal(out[0].customer, null);
  assert.equal(isAssignedProvider(openOffer, provider, "mechanic"), false);
});

test("open-offer and customer-facing endpoints do not use the customer serializer", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../src/controllers/requests.controller.js"), "utf8");
  const body = (name) => {
    const start = src.indexOf(`async function ${name}(`);
    assert.notEqual(start, -1, `controller function ${name} not found`);
    const end = src.indexOf("\nasync function", start + 10);
    return src.slice(start, end === -1 ? undefined : end);
  };
  // listProviderRequests backs GET /api/requests/open (open offers).
  for (const name of ["listProviderRequests", "listMyRequests", "createRequest"]) assert.doesNotMatch(body(name), /serializeForViewer/, name);
  for (const name of ["getRequest", "acceptRequest", "getProviderActiveRequest", "updateRequestStatus", "requestExtraWork"]) assert.match(body(name), /serializeForViewer/, name);
});
