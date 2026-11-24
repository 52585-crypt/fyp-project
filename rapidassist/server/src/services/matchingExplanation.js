// Human-readable reason an offer was made, for the admin active-jobs API. Text only; no decisions depend on it.

const minutes = (seconds) => Math.max(1, Math.round((seconds || 0) / 60));
const round1 = (value) => Math.round(value * 10) / 10;

function matchingExplanation(offer) {
  if (offer.algorithmVersion === "smart-hungarian-v1" && offer.costBreakdown) {
    const b = offer.costBreakdown;
    return `Selected by smart matching (Hungarian assignment per service category; priority first, then lowest cost) `
      + `with ${offer.priority} priority and ${minutes(offer.travelDurationSeconds)}-minute travel time (${offer.routeSource}). `
      + `Pair cost ${round1(b.pairCost)}/100, lower is better: ETA ${round1(b.E)}, rating ${round1(b.Q)}, acceptance ${round1(b.A)}, `
      + `response time ${round1(b.S)}, recent workload ${round1(b.F)}, wait/urgency ${round1(b.T)}.`;
  }
  if (offer.algorithmVersion === "batch-mincost-v1") {
    return `Selected by the batch optimizer using ${offer.priority} priority and ${minutes(offer.travelDurationSeconds)}-minute travel time (${offer.routeSource}).`;
  }
  return `Selected using proximity ${Math.round(offer.components.proximity * 100)}%, adjusted rating ${Math.round(offer.components.rating * 100)}%, experience ${Math.round(offer.components.experience * 100)}%, and response speed ${Math.round(offer.components.responseSpeed * 100)}%.`;
}

module.exports = { matchingExplanation };
