/**
 * Customer contact details for the provider assigned to a request.
 *
 * Privacy rule: only the caller acting as a provider (authRole "mechanic") whose id is the
 * request's providerId receives { id, name, phone }. Open offers (no providerId), the customer,
 * other providers and admins never get this field from these endpoints.
 */
function isAssignedProvider(request, user, authRole) {
  const viewerId = user?._id?.toString();
  return authRole === "mechanic" && Boolean(viewerId) && Boolean(request?.providerId)
    && request.providerId.toString() === viewerId;
}

/**
 * @param requests  mongoose ServiceRequest docs (source of providerId / userId)
 * @param payloads  serialized requests, same order as `requests`
 * @param findUsers async (ids: string[]) => Array<{ _id, name, phone }>
 */
async function attachCustomerForAssignedProvider(requests, payloads, user, authRole, findUsers) {
  const visible = requests.map((request) => isAssignedProvider(request, user, authRole));
  const ids = [...new Set(requests.filter((_, i) => visible[i]).map((r) => r.userId?.toString()).filter(Boolean))];
  if (!ids.length) return payloads;
  const customers = new Map((await findUsers(ids)).map((c) => [c._id.toString(), c]));
  return payloads.map((payload, i) => {
    if (!visible[i]) return payload;
    const c = customers.get(requests[i].userId?.toString());
    return { ...payload, customer: c ? { id: c._id.toString(), name: c.name || null, phone: c.phone || null } : null };
  });
}

module.exports = { isAssignedProvider, attachCustomerForAssignedProvider };
