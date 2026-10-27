# RapidAssist platform rule

For every feature implementation, modification, or fix, treat Android and Expo Web as supported platforms unless the user explicitly limits the scope.

Before implementation, briefly state the Android impact, Web impact, shared files affected, and platform-specific files affected.

Check existing behavior on both platforms. Implement and verify the feature on both whenever technically possible. Reuse shared business logic, API functions, authentication logic, types, and components. Use platform-specific files or `Platform.OS` conditions only where the platforms genuinely need different behavior.

Never silently leave Android or Web unchanged. If a platform cannot support the feature, explain which platform, why, the closest alternative, and whether future support is possible.

After implementation, report Android status, Web status, Android test result, Web test result, and any platform-specific limitation. Run appropriate checks for both platforms, including TypeScript, tests, and build or bundle validation when relevant.

Default expectation: Android and Web both work.
