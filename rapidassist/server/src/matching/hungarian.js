// Hungarian (Kuhn–Munkres) assignment with an "unmatched" option per request. Pure JS, no dependencies.
//
// Reduction: an R × (P + R) matrix. Columns 0..P-1 are providers; cell = pair cost, or forbidden (null /
// non-finite) for an ineligible pair. Columns P..P+R-1 are dummies; every dummy cell in row i costs
// unmatchedCosts[i]. Rows ≤ columns always holds, so the shortest-augmenting-path variant with potentials
// assigns every row in O(R² · (P + R)) ⊆ O(n³) for n = max(R, P). Each provider column is used at most once.
// Forbidden cells are +Infinity: the algorithm can always reach a free finite dummy column, so it never selects
// one. As a second guard, a row that lands on a forbidden or dummy column is reported unmatched.

function isForbidden(value) {
  return value == null || !Number.isFinite(value);
}

/**
 * Numeric core.
 * @param {Array<Array<number|null>>} costs R rows × P columns; null / non-finite = forbidden.
 * @param {number[]} unmatchedCosts length R, finite and ≥ 0.
 * @returns {{ rowToColumn: Array<number|null>, totalCost: number, assignedCost: number, unmatchedCost: number,
 *             unmatchedCount: number }}
 *   rowToColumn[i] is a provider column index, or null when row i is unmatched. assignedCost is the sum of real
 *   pair costs only; unmatchedCost is the sum of dummy penalties; totalCost = assignedCost + unmatchedCost is the
 *   solver objective and must never be reported as an assignment cost.
 */
function solveMatrix(costs, unmatchedCosts) {
  const rows = costs.length;
  if (unmatchedCosts.length !== rows) throw new Error("unmatchedCosts must have one entry per row");
  if (!rows) return { rowToColumn: [], totalCost: 0, assignedCost: 0, unmatchedCost: 0, unmatchedCount: 0 };
  const providers = costs[0].length;
  costs.forEach((row, index) => {
    if (row.length !== providers) throw new Error(`Row ${index} has ${row.length} columns, expected ${providers}`);
  });
  unmatchedCosts.forEach((value, index) => {
    if (!Number.isFinite(value) || value < 0) throw new Error(`unmatchedCosts[${index}] must be a finite non-negative number`);
  });

  const columns = providers + rows;
  const cell = (row, column) => {
    if (column >= providers) return unmatchedCosts[row];
    const value = costs[row][column];
    return isForbidden(value) ? Infinity : value;
  };

  // 1-indexed arrays as in the classical formulation; index 0 is the virtual start column / row.
  const u = new Float64Array(rows + 1);
  const v = new Float64Array(columns + 1);
  const owner = new Int32Array(columns + 1); // owner[j] = row assigned to column j (1-indexed), 0 = free
  const way = new Int32Array(columns + 1);
  const minv = new Float64Array(columns + 1);
  const used = new Uint8Array(columns + 1);

  for (let row = 1; row <= rows; row += 1) {
    owner[0] = row;
    let column0 = 0;
    minv.fill(Infinity);
    used.fill(0);
    do {
      used[column0] = 1;
      const row0 = owner[column0];
      let delta = Infinity;
      let column1 = -1;
      for (let column = 1; column <= columns; column += 1) {
        if (used[column]) continue;
        const reduced = cell(row0 - 1, column - 1) - u[row0] - v[column];
        if (reduced < minv[column]) {
          minv[column] = reduced;
          way[column] = column0;
        }
        if (minv[column] < delta) {
          delta = minv[column];
          column1 = column;
        }
      }
      // Unreachable while every dummy cell is finite; kept as an explicit invariant check.
      if (column1 < 0 || !Number.isFinite(delta)) throw new Error("Hungarian: no finite augmenting path");
      for (let column = 0; column <= columns; column += 1) {
        if (used[column]) {
          u[owner[column]] += delta;
          v[column] -= delta;
        } else {
          minv[column] -= delta;
        }
      }
      column0 = column1;
    } while (owner[column0] !== 0);
    do {
      const column1 = way[column0];
      owner[column0] = owner[column1];
      column0 = column1;
    } while (column0 !== 0);
  }

  const rowToColumn = Array(rows).fill(null);
  let assignedCost = 0;
  let unmatchedCost = 0;
  let unmatchedCount = 0;
  for (let column = 1; column <= columns; column += 1) {
    const row = owner[column] - 1;
    if (row < 0) continue;
    const providerColumn = column - 1;
    if (providerColumn < providers && !isForbidden(costs[row][providerColumn])) {
      rowToColumn[row] = providerColumn;
      assignedCost += costs[row][providerColumn];
    }
  }
  rowToColumn.forEach((column, row) => {
    if (column != null) return;
    unmatchedCost += unmatchedCosts[row];
    unmatchedCount += 1;
  });
  return { rowToColumn, totalCost: assignedCost + unmatchedCost, assignedCost, unmatchedCost, unmatchedCount };
}

const idOf = (value) => String(value?.id ?? value?._id ?? value);
const timeOf = (value) => {
  const time = new Date(value?.createdAt ?? 0).getTime();
  return Number.isFinite(time) ? time : 0;
};
const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Deterministic order: requests by createdAt, then id; providers by id. */
function orderRequests(requests) {
  return [...requests].sort((a, b) => timeOf(a) - timeOf(b) || compareIds(idOf(a), idOf(b)));
}
function orderProviders(providers) {
  return [...providers].sort((a, b) => compareIds(idOf(a), idOf(b)));
}

/**
 * Id-level assignment.
 * @param {object} input
 * @param {object[]} input.requests  objects with id/_id and createdAt
 * @param {object[]} input.providers objects with id/_id
 * @param {(request, provider) => number|null} input.pairCost cost of an eligible pair, null when ineligible
 * @param {(orderedRequests, providerCount) => number[]} input.unmatchedCosts dummy cost per ordered request
 * @returns {{ assignments: Array<{requestId, providerId, cost}>, unmatchedRequests: string[], totalCost: number,
 *             assignedCost: number, unmatchedCost: number, unmatchedCount: number }}
 */
function assign({ requests, providers, pairCost, unmatchedCosts }) {
  const orderedRequests = orderRequests(requests);
  const orderedProviders = orderProviders(providers);
  const matrix = orderedRequests.map((request) => orderedProviders.map((provider) => {
    const value = pairCost(request, provider);
    return isForbidden(value) ? null : value;
  }));
  const solution = solveMatrix(matrix, unmatchedCosts(orderedRequests, orderedProviders.length));
  const assignments = [];
  const unmatchedRequests = [];
  solution.rowToColumn.forEach((column, row) => {
    const requestId = idOf(orderedRequests[row]);
    if (column == null) unmatchedRequests.push(requestId);
    else assignments.push({ requestId, providerId: idOf(orderedProviders[column]), cost: matrix[row][column] });
  });
  return {
    assignments,
    unmatchedRequests,
    totalCost: solution.totalCost,
    assignedCost: solution.assignedCost,
    unmatchedCost: solution.unmatchedCost,
    unmatchedCount: solution.unmatchedCount
  };
}

module.exports = { assign, orderProviders, orderRequests, solveMatrix };
