const PUBLIC_USER_ROLES = ["user", "mechanic"];

function accountRoles(user) {
  if (user.role === "admin") return ["admin"];
  return PUBLIC_USER_ROLES.filter(role => user.role === role || user.roles?.includes(role));
}

function roleFilter(role) {
  return {
    $or: [
      { role },
      { role: { $in: PUBLIC_USER_ROLES }, roles: role }
    ]
  };
}

function sessionRole(user, claimedRole) {
  const role = claimedRole === undefined ? user.role : claimedRole;
  return accountRoles(user).includes(role) ? role : null;
}

module.exports = { PUBLIC_USER_ROLES, accountRoles, roleFilter, sessionRole };
